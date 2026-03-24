<?php

declare(strict_types=1);

require_once __DIR__ . '/../api/bootstrap.php';

cors();

if (($_SERVER['REQUEST_METHOD'] ?? 'POST') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed',
    ], 405);
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

$email = isset($data['email']) ? trim((string) $data['email']) : '';
$password = isset($data['password']) ? (string) $data['password'] : '';
$displayName = isset($data['displayName']) ? trim((string) $data['displayName']) : '';
$userType = 'audience';

if ($email === '' || $password === '' || $displayName === '') {
    json_response([
        'success' => false,
        'message' => 'E-Mail, Passwort und Anzeigename werden benötigt.',
    ], 400);
}

if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    json_response([
        'success' => false,
        'message' => 'Ungültige E-Mail-Adresse.',
    ], 400);
}

if (mb_strlen($password) < 8) {
    json_response([
        'success' => false,
        'message' => 'Passwort muss mindestens 8 Zeichen haben.',
    ], 400);
}

$passwordHash = password_hash($password, PASSWORD_DEFAULT);
if (!is_string($passwordHash) || $passwordHash === '') {
    json_response([
        'success' => false,
        'message' => 'Server-Fehler beim Hashing.',
    ], 500);
}

$existing = find_user_by_email($email);
if ($existing !== null) {
    json_response([
        'success' => false,
        'message' => 'Diese E-Mail ist bereits registriert.',
    ], 409);
}

$id = user_id_from_email($email);

$store = get_users_store();
$store['users'][] = [
    'id' => $id,
    'email' => $email,
    'password_hash' => $passwordHash,
    'displayName' => $displayName,
    'accessRole' => 'user',
    'userType' => $userType,
];

save_users_store($store);
ensure_user_data_dirs($id);

$session = create_session($id);
$token = (string) ($session['token'] ?? '');

json_response([
    'success' => true,
    'user' => [
        'id' => $id,
        'email' => $email,
        'displayName' => $displayName,
        'accessRole' => 'user',
        'userType' => $userType,
    ],
    'token' => $token,
]);
