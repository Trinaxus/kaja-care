<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

[$user] = require_auth_user();

json_response([
    'success' => true,
    'user' => [
        'id' => (string) ($user['id'] ?? ''),
        'email' => (string) ($user['email'] ?? ''),
        'displayName' => (string) (($user['displayName'] ?? '') !== '' ? $user['displayName'] : ($user['email'] ?? '')),
        'accessRole' => (string) (($user['accessRole'] ?? '') !== '' ? $user['accessRole'] : 'user'),
        'userType' => (string) (($user['userType'] ?? '') !== '' ? $user['userType'] : 'audience'),
        'color' => (string) (($user['color'] ?? '') !== '' ? $user['color'] : 'blue'),
        'preferences' => (isset($user['preferences']) && is_array($user['preferences'])) ? $user['preferences'] : new stdClass(),
    ],
]);
