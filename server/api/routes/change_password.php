<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

cors();

// Preflight-Request direkt beantworten
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
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

$currentPassword = isset($data['currentPassword']) ? $data['currentPassword'] : '';
$newPassword = isset($data['newPassword']) ? $data['newPassword'] : '';

// Minimale Validierung
if ($currentPassword === '' || $newPassword === '') {
    json_response([
        'success' => false,
        'message' => 'Aktuelles und neues Passwort werden benötigt.',
    ], 400);
}

if (mb_strlen($newPassword) < 6) {
    json_response([
        'success' => false,
        'message' => 'Das neue Passwort muss mindestens 6 Zeichen lang sein.',
    ], 400);
}

// Authentifizierte User holen
[$user] = require_auth_user();

// Aktuelles Passwort validieren
if (!isset($user['password_hash']) || !password_verify($currentPassword, (string) $user['password_hash'])) {
    json_response([
        'success' => false,
        'message' => 'Das aktuelle Passwort ist falsch.',
    ], 401);
}

// Neues Passwort hashen
$newPasswordHash = password_hash($newPassword, PASSWORD_DEFAULT);
if (!is_string($newPasswordHash) || $newPasswordHash === '') {
    json_response([
        'success' => false,
        'message' => 'Server-Fehler beim Hashing.',
    ], 500);
}

// User Store aktualisieren
$store = get_users_store();
$updated = false;

foreach ($store['users'] as &$userRecord) {
    if (isset($userRecord['id']) && (string) $userRecord['id'] === (string) $user['id']) {
        $userRecord['password_hash'] = $newPasswordHash;
        $userRecord['updatedAt'] = time();
        $updated = true;
        break;
    }
}

if (!$updated) {
    json_response([
        'success' => false,
        'message' => 'User nicht gefunden.',
    ], 404);
}

save_users_store($store);

json_response([
    'success' => true,
    'message' => 'Passwort erfolgreich geändert.',
]);
