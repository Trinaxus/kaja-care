<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

require_auth_user();

$store = get_users_store();
$out = [];

foreach (($store['users'] ?? []) as $user) {
    if (!is_array($user)) {
        continue;
    }

    if ((bool) ($user['disabled'] ?? false)) {
        continue;
    }

    $id = isset($user['id']) && (string) $user['id'] !== ''
        ? (string) $user['id']
        : user_id_from_email((string) ($user['email'] ?? ''));

    $out[] = [
        'id' => $id,
        'email' => (string) ($user['email'] ?? ''),
        'displayName' => (string) (($user['displayName'] ?? '') !== '' ? $user['displayName'] : ($user['email'] ?? '')),
        'color' => (string) (($user['color'] ?? '') !== '' ? $user['color'] : 'blue'),
    ];
}

json_response([
    'success' => true,
    'users' => $out,
]);
