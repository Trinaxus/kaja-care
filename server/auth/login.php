<?php
 
declare(strict_types=1);

require_once __DIR__ . '/../api/bootstrap.php';

cors();

// Preflight-Request direkt beantworten
if (($_SERVER['REQUEST_METHOD'] ?? 'POST') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Nur POST erlauben
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed',
    ], 405);
}

// Request-Body einlesen
$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

$email    = isset($data['email']) ? trim($data['email']) : '';
$password = isset($data['password']) ? $data['password'] : '';

// Minimale Validierung
if ($email === '' || $password === '') {
    json_response([
        'success' => false,
        'message' => 'E-Mail und Passwort werden benötigt.',
    ], 400);
}

// DB-frei: User nur aus JSON-Store laden
$foundUser = find_user_by_email($email);

// E-Mail oder Passwort falsch
if (!$foundUser || !isset($foundUser['password_hash']) || !password_verify($password, (string) $foundUser['password_hash'])) {
    json_response([
        'success' => false,
        'message' => 'Ungültige Anmeldedaten.',
    ], 401);
}

if ((bool) ($foundUser['disabled'] ?? false)) {
    json_response([
        'success' => false,
        'message' => 'User ist deaktiviert.',
    ], 403);
}

$foundUser['id'] = isset($foundUser['id']) && (string) $foundUser['id'] !== ''
    ? (string) $foundUser['id']
    : user_id_from_email((string) ($foundUser['email'] ?? ''));

try {
    ensure_user_data_dirs((string) $foundUser['id']);
    $session = create_session((string) $foundUser['id']);
    $token = (string) ($session['token'] ?? '');
} catch (Throwable $e) {
    json_response([
        'success' => false,
        'message' => 'Server storage error: ' . $e->getMessage(),
    ], 500);
}

$displayName = isset($foundUser['displayName']) && (string) $foundUser['displayName'] !== ''
    ? (string) $foundUser['displayName']
    : (string) $foundUser['email'];
$accessRole = isset($foundUser['accessRole']) && (string) $foundUser['accessRole'] !== ''
    ? (string) $foundUser['accessRole']
    : 'user';
$userType = isset($foundUser['userType']) && (string) $foundUser['userType'] !== ''
    ? (string) $foundUser['userType']
    : 'audience';
$color = isset($foundUser['color']) && (string) $foundUser['color'] !== ''
    ? (string) $foundUser['color']
    : 'blue';

// Erfolgreiche Antwort
json_response([
    'success' => true,
    'user' => [
        'id'          => (string) $foundUser['id'],
        'email'       => $foundUser['email'],
        'displayName' => $displayName,
        'accessRole'  => $accessRole,
        'userType'    => $userType,
        'color'       => $color,
    ],
    'token' => $token
]);