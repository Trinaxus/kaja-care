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
        : '';

    if ($id === '') {
        $email = (string) ($user['email'] ?? '');
        if (trim($email) === '') {
            continue;
        }
        $id = user_id_from_email($email);
    }

    $out[] = [
        'id' => $id,
        'email' => (string) ($user['email'] ?? ''),
        'displayName' => (string) (($user['displayName'] ?? '') !== '' ? $user['displayName'] : ($user['email'] ?? '')),
        'color' => (string) (($user['color'] ?? '') !== '' ? $user['color'] : 'blue'),
        'preferences' => (isset($user['preferences']) && is_array($user['preferences'])) ? $user['preferences'] : new stdClass(),
    ];
}

json_response([
    'success' => true,
    'users' => $out,
]);
