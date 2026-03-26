<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

// Debug: Log that the route was called
error_log('DEBUG: update-profile route called');

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

// Debug: Log received data
error_log('DEBUG update-profile: Received payload: ' . json_encode($payload));
error_log('DEBUG update-profile: Preferences: ' . json_encode($preferences));

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
error_log('DEBUG: Users store loaded: ' . json_encode(array_keys($store)));
error_log('DEBUG: Number of users in store: ' . count($store['users'] ?? []));

if (!is_array($store) || !isset($store['users'])) {
    json_response([
        'success' => false,
        'message' => 'Users store corrupted',
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
            error_log('DEBUG: Updated user preferences: ' . json_encode($preferences));
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
error_log('DEBUG: About to save users store');
save_users_store($store);
error_log('DEBUG: Users store saved successfully');

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

// Debug: Log response
error_log('DEBUG update-profile: Response sent with preferences: ' . json_encode(isset($updated['preferences']) ? $updated['preferences'] : 'null'));
