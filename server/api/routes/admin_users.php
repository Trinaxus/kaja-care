<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

require_admin_user();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $store = get_users_store();
    $out = [];

    foreach ($store['users'] as $user) {
        if (!is_array($user)) {
            continue;
        }

        $id = isset($user['id']) && (string) $user['id'] !== ''
            ? (string) $user['id']
            : user_id_from_email((string) ($user['email'] ?? ''));

        $out[] = [
            'id' => $id,
            'email' => (string) ($user['email'] ?? ''),
            'displayName' => (string) (($user['displayName'] ?? '') !== '' ? $user['displayName'] : ($user['email'] ?? '')),
            'accessRole' => (string) (($user['accessRole'] ?? '') !== '' ? $user['accessRole'] : 'user'),
            'userType' => (string) (($user['userType'] ?? '') !== '' ? $user['userType'] : 'audience'),
            'color' => (string) (($user['color'] ?? '') !== '' ? $user['color'] : 'blue'),
            'disabled' => (bool) ($user['disabled'] ?? false),
        ];
    }

    json_response([
        'success' => true,
        'users' => $out,
    ]);
}

$raw = file_get_contents('php://input');
$payload = json_decode((string) $raw, true);
if (!is_array($payload)) {
    $payload = [];
}

if ($method === 'POST') {
    $email = isset($payload['email']) ? trim((string) $payload['email']) : '';
    $password = isset($payload['password']) ? (string) $payload['password'] : '';
    $displayName = isset($payload['displayName']) ? trim((string) $payload['displayName']) : '';
    $accessRole = isset($payload['accessRole']) ? trim((string) $payload['accessRole']) : 'user';
    $userType = isset($payload['userType']) ? trim((string) $payload['userType']) : 'audience';
    $color = isset($payload['color']) ? trim((string) $payload['color']) : 'blue';

    if ($email === '') {
        if ($displayName === '') {
            json_response([
                'success' => false,
                'message' => 'displayName required',
            ], 400);
        }

        $store = get_users_store();

        $id = '';
        for ($i = 0; $i < 5; $i++) {
            $candidate = 'local-' . substr(sha1((string) microtime(true) . '|' . (string) random_int(0, PHP_INT_MAX)), 0, 24);
            $exists = false;

            foreach ($store['users'] as $u) {
                if (!is_array($u)) {
                    continue;
                }
                $uid = isset($u['id']) && (string) $u['id'] !== '' ? (string) $u['id'] : user_id_from_email((string) ($u['email'] ?? ''));
                if ($uid === $candidate) {
                    $exists = true;
                    break;
                }
            }

            if (!$exists) {
                $id = $candidate;
                break;
            }
        }

        if ($id === '') {
            json_response([
                'success' => false,
                'message' => 'Could not generate user id',
            ], 500);
        }

        $store['users'][] = [
            'id' => $id,
            'email' => '',
            'displayName' => $displayName,
            'accessRole' => $accessRole,
            'userType' => $userType,
            'color' => $color,
            'disabled' => false,
        ];

        save_users_store($store);
        ensure_user_data_dirs($id);

        json_response([
            'success' => true,
            'user' => [
                'id' => $id,
                'email' => '',
                'displayName' => $displayName,
                'accessRole' => $accessRole,
                'userType' => $userType,
                'color' => $color,
                'disabled' => false,
            ],
        ], 201);
    }

    if ($email === '' || $password === '' || $displayName === '') {
        json_response([
            'success' => false,
            'message' => 'email, password, displayName required',
        ], 400);
    }

    if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        json_response([
            'success' => false,
            'message' => 'Invalid email',
        ], 400);
    }

    if (mb_strlen($password) < 8) {
        json_response([
            'success' => false,
            'message' => 'Password must be at least 8 characters',
        ], 400);
    }

    $existing = find_user_by_email($email);
    if ($existing !== null) {
        json_response([
            'success' => false,
            'message' => 'User already exists',
        ], 409);
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    if (!is_string($hash) || $hash === '') {
        json_response([
            'success' => false,
            'message' => 'Hashing failed',
        ], 500);
    }

    $id = user_id_from_email($email);

    $store = get_users_store();
    $store['users'][] = [
        'id' => $id,
        'email' => $email,
        'password_hash' => $hash,
        'displayName' => $displayName,
        'accessRole' => $accessRole,
        'userType' => $userType,
        'color' => $color,
    ];

    save_users_store($store);
    ensure_user_data_dirs($id);

    json_response([
        'success' => true,
        'user' => [
            'id' => $id,
            'email' => $email,
            'displayName' => $displayName,
            'accessRole' => $accessRole,
            'userType' => $userType,
            'color' => $color,
        ],
    ], 201);
}

if ($method === 'PATCH') {
    $id = isset($payload['id']) ? trim((string) $payload['id']) : '';
    $email = isset($payload['email']) ? trim((string) $payload['email']) : '';

    if ($id === '' && $email === '') {
        json_response([
            'success' => false,
            'message' => 'id or email required',
        ], 400);
    }

    $store = get_users_store();
    $updated = null;

    foreach ($store['users'] as $idx => $user) {
        if (!is_array($user)) {
            continue;
        }

        $userId = isset($user['id']) && (string) $user['id'] !== ''
            ? (string) $user['id']
            : user_id_from_email((string) ($user['email'] ?? ''));

        $match = ($id !== '' && $userId === $id) || ($email !== '' && isset($user['email']) && strcasecmp((string) $user['email'], $email) === 0);
        if (!$match) {
            continue;
        }

        if (isset($payload['displayName'])) {
            $user['displayName'] = trim((string) $payload['displayName']);
        }
        if (isset($payload['accessRole'])) {
            $user['accessRole'] = trim((string) $payload['accessRole']);
        }
        if (isset($payload['userType'])) {
            $user['userType'] = trim((string) $payload['userType']);
        }
        if (isset($payload['color'])) {
            $user['color'] = trim((string) $payload['color']);
        }
        if (array_key_exists('disabled', $payload)) {
            $user['disabled'] = (bool) $payload['disabled'];
        }
        if (isset($payload['password']) && (string) $payload['password'] !== '') {
            if (mb_strlen((string) $payload['password']) < 8) {
                json_response([
                    'success' => false,
                    'message' => 'Password must be at least 8 characters',
                ], 400);
            }
            $hash = password_hash((string) $payload['password'], PASSWORD_DEFAULT);
            if (!is_string($hash) || $hash === '') {
                json_response([
                    'success' => false,
                    'message' => 'Hashing failed',
                ], 500);
            }
            $user['password_hash'] = $hash;
        }

        $user['id'] = $userId;
        $store['users'][$idx] = $user;
        $updated = $user;
        break;
    }

    if ($updated === null) {
        json_response([
            'success' => false,
            'message' => 'User not found',
        ], 404);
    }

    save_users_store($store);
    ensure_user_data_dirs((string) $updated['id']);

    json_response([
        'success' => true,
        'user' => [
            'id' => (string) $updated['id'],
            'email' => (string) ($updated['email'] ?? ''),
            'displayName' => (string) (($updated['displayName'] ?? '') !== '' ? $updated['displayName'] : ($updated['email'] ?? '')),
            'accessRole' => (string) (($updated['accessRole'] ?? '') !== '' ? $updated['accessRole'] : 'user'),
            'userType' => (string) (($updated['userType'] ?? '') !== '' ? $updated['userType'] : 'audience'),
            'color' => (string) (($updated['color'] ?? '') !== '' ? $updated['color'] : 'blue'),
            'disabled' => (bool) ($updated['disabled'] ?? false),
        ],
    ]);
}

json_response([
    'success' => false,
    'message' => 'Method not allowed',
], 405);
