<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

[$user] = require_auth_user();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method !== 'PATCH') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed',
    ], 405);
}

// Get current user ID from authenticated user
$userId = isset($user['id']) ? (string) $user['id'] : '';
if ($userId === '') {
    json_response([
        'success' => false,
        'message' => 'User not authenticated',
    ], 401);
}

$raw = file_get_contents('php://input');
$payload = json_decode((string) $raw, true);
if (!is_array($payload)) {
    json_response([
        'success' => false,
        'message' => 'Invalid JSON payload',
    ], 400);
}

// Validate input
$name = isset($payload['name']) ? trim((string) $payload['name']) : '';
$email = isset($payload['email']) ? trim((string) $payload['email']) : '';
$color = isset($payload['color']) ? trim((string) $payload['color']) : '';
$preferences = isset($payload['preferences']) && is_array($payload['preferences']) ? $payload['preferences'] : null;

if ($name === '') {
    json_response([
        'success' => false,
        'message' => 'Name is required',
    ], 400);
}

if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    json_response([
        'success' => false,
        'message' => 'Invalid email format',
    ], 400);
}

// Load users store
$store = get_users_store();
if (!is_array($store) || !isset($store['users'])) {
    json_response([
        'success' => false,
        'message' => 'Users store not found',
    ], 500);
}

// Find and update user
$updated = null;
foreach ($store['users'] as $idx => $user) {
    if (!is_array($user)) {
        continue;
    }
    
    $userIdFromStore = isset($user['id']) && (string) $user['id'] !== ''
        ? (string) $user['id']
        : user_id_from_email((string) ($user['email'] ?? ''));
    
    if ($userIdFromStore === $userId) {
        // Update user data
        $user['displayName'] = $name;
        $user['email'] = $email !== '' ? $email : $user['email'];
        $user['color'] = $color !== '' ? $color : $user['color'];
        
        // Update preferences if provided
        if ($preferences !== null) {
            $user['preferences'] = $preferences;
        }
        
        $store['users'][$idx] = $user;
        $updated = $user;
        break;
    }
}

if ($updated === null) {
    json_response([
        'success' => false,
        'message' => 'User not found',
    ], 404);
}

// Save updated store
save_users_store($store);

json_response([
    'success' => true,
    'user' => [
        'id' => $userId,
        'email' => (string) ($updated['email'] ?? ''),
        'displayName' => (string) $updated['displayName'],
        'color' => (string) (($updated['color'] ?? '') !== '' ? $updated['color'] : 'blue'),
        'preferences' => (isset($updated['preferences']) && is_array($updated['preferences'])) ? $updated['preferences'] : new stdClass(),
    ],
]);
