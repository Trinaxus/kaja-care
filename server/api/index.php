<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

cors();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$path = isset($_GET['path']) ? (string) $_GET['path'] : '';
$path = trim($path, "/ \t\n\r\0\x0B");

if ($path === '') {
    $pathInfo = isset($_SERVER['PATH_INFO']) ? (string) $_SERVER['PATH_INFO'] : '';
    $pathInfo = trim($pathInfo, "/ \t\n\r\0\x0B");
    if ($pathInfo !== '') {
        $path = $pathInfo;
    }
}

if ($path === '') {
    $uriPath = parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
    $uriPath = is_string($uriPath) ? $uriPath : '';
    $uriPath = trim($uriPath);
    // Try to extract everything after '/api/'
    $pos = strrpos($uriPath, '/api/');
    if ($pos !== false) {
        $candidate = substr($uriPath, $pos + 5);
        $candidate = trim((string) $candidate, "/ \t\n\r\0\x0B");
        if ($candidate !== '' && $candidate !== 'index.php') {
            $path = $candidate;
        }
    }
}

if ($path === '') {
    json_response([
        'success' => false,
        'message' => 'Not found',
    ], 404);
}

switch ($path) {
    case 'auth/login':
        require __DIR__ . '/../auth/login.php';
        break;

    case 'auth/me':
        require __DIR__ . '/routes/auth_me.php';
        break;

    case 'auth/register':
        require __DIR__ . '/../auth/register.php';
        break;

    case 'admin/users':
        require __DIR__ . '/routes/admin_users.php';
        break;

    case 'assets':
        require __DIR__ . '/routes/assets.php';
        break;

    case 'users':
        require __DIR__ . '/routes/users.php';
        break;

    case 'collections':
        require __DIR__ . '/routes/collections.php';
        break;

    case 'auth/change-password':
        // Debug: Log that we reached this route
        error_log('DEBUG: auth/change-password route reached');
        require __DIR__ . '/routes/change_password.php';
        break;

    case 'calendar/ics':
        $routeFile = __DIR__ . '/routes/calendar_ics.php';
        if (!is_file($routeFile)) {
            json_response([
                'success' => false,
                'message' => 'Route file missing: routes/calendar_ics.php',
            ], 500);
        }
        require $routeFile;
        break;

    default:
        // Debug: Log the path that was not found
        error_log('DEBUG: Route not found: ' . $path);
        json_response([
            'success' => false,
            'message' => 'Not found',
        ], 404);
}
