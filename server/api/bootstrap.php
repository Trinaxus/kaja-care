<?php

declare(strict_types=1);

function load_env_file(string $path): void
{
    if (!is_file($path) || !is_readable($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines)) {
        return;
    }

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }

        $pos = strpos($line, '=');
        if ($pos === false) {
            continue;
        }

        $key = trim(substr($line, 0, $pos));
        $value = trim(substr($line, $pos + 1));

        if ($key === '') {
            continue;
        }

        if ((str_starts_with($value, '"') && str_ends_with($value, '"')) || (str_starts_with($value, "'") && str_ends_with($value, "'"))) {
            $value = substr($value, 1, -1);
        }

        $_ENV[$key] = $value;
        putenv($key . '=' . $value);
    }
}

load_env_file(__DIR__ . '/../.env');

define('PROJECT_ROOT', dirname(__DIR__));

define('DATA_ROOT', PROJECT_ROOT . '/data');
define('USERS_STORE_PATH', DATA_ROOT . '/users.json');
define('SESSION_STORE_PATH', DATA_ROOT . '/sessions.json');

function cors(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    $origins = getenv('CORS_ORIGINS');
    if (!is_string($origins) || trim($origins) === '') {
        $origins = '*';
    }

    $origins = trim($origins);
    if ($origins === '*') {
        header('Access-Control-Allow-Origin: ' . ($origin !== '' ? $origin : '*'));
        header('Vary: Origin');
    } else {
        $allowedOrigins = array_values(array_filter(array_map('trim', explode(',', $origins)), static fn($v) => $v !== ''));
        foreach ($allowedOrigins as $allowedOrigin) {
            if ($origin !== '' && strcasecmp($allowedOrigin, $origin) === 0) {
                header('Access-Control-Allow-Origin: ' . $origin);
                header('Vary: Origin');
                break;
            }
        }
    }

    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Credentials: true');
}

function json_response(array $payload, int $statusCode = 200): never
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function read_json_file(string $path, array $default = []): array
{
    if (!is_file($path)) {
        return $default;
    }

    $raw = file_get_contents($path);
    $decoded = json_decode((string) $raw, true);
    return is_array($decoded) ? $decoded : $default;
}

function write_json_file_atomic(string $path, array $data): void
{
    $dir = dirname($path);
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new RuntimeException('Cannot create directory: ' . $dir);
        }
    }

    $tmp = $path . '.tmp';
    $bytes = file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    if ($bytes === false) {
        throw new RuntimeException('Cannot write file: ' . $tmp);
    }

    if (!rename($tmp, $path)) {
        throw new RuntimeException('Cannot move file into place: ' . $path);
    }
}

function user_id_from_email(string $email): string
{
    $hash = sha1(strtolower(trim($email)));
    return substr($hash, 0, 8) . '-' . substr($hash, 8, 4) . '-' . substr($hash, 12, 4) . '-' . substr($hash, 16, 4) . '-' . substr($hash, 20, 12);
}

function get_users_store(): array
{
    $store = read_json_file(USERS_STORE_PATH, ['users' => []]);
    if (!isset($store['users']) || !is_array($store['users'])) {
        $store['users'] = [];
    }
    return $store;
}

function save_users_store(array $store): void
{
    if (!isset($store['users']) || !is_array($store['users'])) {
        $store['users'] = [];
    }
    write_json_file_atomic(USERS_STORE_PATH, $store);
}

function find_user_by_id(string $id): ?array
{
    $store = get_users_store();
    foreach ($store['users'] as $user) {
        if (!is_array($user)) {
            continue;
        }
        $userId = isset($user['id']) && (string) $user['id'] !== '' ? (string) $user['id'] : user_id_from_email((string) ($user['email'] ?? ''));
        if ($userId === $id) {
            $user['id'] = $userId;
            return $user;
        }
    }
    return null;
}

function find_user_by_email(string $email): ?array
{
    $store = get_users_store();
    error_log('DEBUG: Users store contains ' . count($store['users'] ?? []) . ' users');
    foreach ($store['users'] as $user) {
        if (!is_array($user) || !isset($user['email'])) {
            continue;
        }
        error_log('DEBUG: Checking user email: ' . ($user['email'] ?? 'missing') . ' against: ' . $email);
        if (strcasecmp((string) $user['email'], $email) === 0) {
            if (!isset($user['id']) || (string) $user['id'] === '') {
                $user['id'] = user_id_from_email((string) $user['email']);
            }
            error_log('DEBUG: Found matching user: ' . json_encode($user['email'] ?? 'unknown'));
            return $user;
        }
    }
    error_log('DEBUG: No matching user found for email: ' . $email);
    return null;
}

function bearer_token(): string
{
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!is_string($auth) || $auth === '') {
        return '';
    }
    if (stripos($auth, 'Bearer ') !== 0) {
        return '';
    }
    return trim(substr($auth, 7));
}

function get_session_by_token(string $token): ?array
{
    if ($token === '') {
        return null;
    }

    $store = read_json_file(SESSION_STORE_PATH, ['sessions' => []]);
    if (!isset($store['sessions']) || !is_array($store['sessions'])) {
        return null;
    }

    $session = $store['sessions'][$token] ?? null;
    if (!is_array($session) || !isset($session['userId'])) {
        return null;
    }

    $expiresAt = isset($session['expiresAt']) ? (int) $session['expiresAt'] : 0;
    if ($expiresAt !== 0 && $expiresAt < time()) {
        return null;
    }

    $session['token'] = $token;
    return $session;
}

function require_auth_user(): array
{
    $token = bearer_token();
    $session = get_session_by_token($token);
    if ($session === null) {
        json_response([
            'success' => false,
            'message' => 'Unauthorized',
        ], 401);
    }

    $userId = (string) $session['userId'];
    $user = find_user_by_id($userId);
    if ($user === null) {
        json_response([
            'success' => false,
            'message' => 'Unauthorized',
        ], 401);
    }

    return [$user, $session];
}

function require_admin_user(): array
{
    [$user, $session] = require_auth_user();
    $role = isset($user['accessRole']) ? (string) $user['accessRole'] : 'user';
    if (strcasecmp($role, 'admin') !== 0) {
        json_response([
            'success' => false,
            'message' => 'Forbidden',
        ], 403);
    }
    return [$user, $session];
}

function ensure_user_data_dirs(string $userId): void
{
    if ($userId === '') {
        return;
    }

    if (!is_dir(DATA_ROOT)) {
        if (!mkdir(DATA_ROOT, 0755, true) && !is_dir(DATA_ROOT)) {
            throw new RuntimeException('Cannot create data directory: ' . DATA_ROOT);
        }
    }

    $userRoot = DATA_ROOT . '/u/' . $userId;
    $assetsRoot = $userRoot . '/assets';

    if (!is_dir($assetsRoot)) {
        mkdir($assetsRoot, 0755, true);
    }

    $profilePath = $userRoot . '/profile.json';
    if (!is_file($profilePath)) {
        write_json_file_atomic($profilePath, [
            'version' => 1,
            'updatedAt' => time(),
        ]);
    }

    $assetsIndexPath = $assetsRoot . '/index.json';
    if (!is_file($assetsIndexPath)) {
        write_json_file_atomic($assetsIndexPath, [
            'version' => 1,
            'updatedAt' => time(),
        ]);
    }
}

function pdo(): PDO
{
    $dsn = getenv('DB_DSN');
    if (is_string($dsn) && $dsn !== '') {
        return new PDO($dsn, getenv('DB_USER') ?: null, getenv('DB_PASS') ?: null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }

    $host = getenv('DB_HOST');
    $name = getenv('DB_NAME');

    if (!is_string($host) || $host === '' || !is_string($name) || $name === '') {
        throw new RuntimeException('Database not configured. Set DB_DSN or DB_HOST + DB_NAME in server/.env');
    }

    $port = getenv('DB_PORT');
    $charset = getenv('DB_CHARSET');

    $portPart = is_string($port) && $port !== '' ? ';port=' . $port : '';
    $charsetPart = is_string($charset) && $charset !== '' ? ';charset=' . $charset : ';charset=utf8mb4';

    $dsn = 'mysql:host=' . $host . $portPart . ';dbname=' . $name . $charsetPart;

    return new PDO($dsn, getenv('DB_USER') ?: null, getenv('DB_PASS') ?: null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

function create_session(string $userId): array
{
    $token = bin2hex(random_bytes(32));
    $now = time();

    $store = [];
    $path = SESSION_STORE_PATH;

    if (!is_dir(DATA_ROOT)) {
        mkdir(DATA_ROOT, 0755, true);
    }

    $store = read_json_file($path, []);

    if (!isset($store['sessions']) || !is_array($store['sessions'])) {
        $store['sessions'] = [];
    }

    $store['sessions'][$token] = [
        'userId' => $userId,
        'createdAt' => $now,
        'expiresAt' => $now + 60 * 60 * 24 * 30,
    ];

    write_json_file_atomic($path, $store);

    return [
        'token' => $token,
        'userId' => $userId,
    ];
}
