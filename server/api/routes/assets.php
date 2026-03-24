<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

[$user] = require_auth_user();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$asset = isset($_GET['asset']) ? trim((string) $_GET['asset']) : '';
$scope = isset($_GET['scope']) ? trim((string) $_GET['scope']) : 'user';

$allowedAssets = [
    'calendar',
    'logbook',
    'expenses',
];

if ($asset === '' || !in_array($asset, $allowedAssets, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid asset',
        'allowed' => $allowedAssets,
    ], 400);
}

$userId = (string) ($user['id'] ?? '');
if ($userId === '') {
    json_response([
        'success' => false,
        'message' => 'Unauthorized',
    ], 401);
}

ensure_user_data_dirs($userId);

if ($scope === 'shared') {
    $sharedDir = DATA_ROOT . '/shared/assets';
    if (!is_dir($sharedDir)) {
        @mkdir($sharedDir, 0777, true);
    }
    $assetPath = $sharedDir . '/' . $asset . '.json';
} else {
    $assetPath = DATA_ROOT . '/u/' . $userId . '/assets/' . $asset . '.json';
}

if ($method === 'GET') {
    $data = read_json_file($assetPath, [
        'version' => 1,
        'updatedAt' => time(),
        'items' => [],
    ]);

    json_response([
        'success' => true,
        'asset' => $asset,
        'data' => $data,
    ]);
}

if ($method === 'PUT') {
    $raw = file_get_contents('php://input');
    $payload = json_decode((string) $raw, true);

    if (!is_array($payload)) {
        json_response([
            'success' => false,
            'message' => 'Invalid JSON body',
        ], 400);
    }

    if (!isset($payload['items']) || !is_array($payload['items'])) {
        json_response([
            'success' => false,
            'message' => 'Body must contain items: []',
        ], 400);
    }

    $payload['version'] = isset($payload['version']) ? (int) $payload['version'] : 1;
    $payload['updatedAt'] = time();

    try {
        write_json_file_atomic($assetPath, $payload);
    } catch (Throwable $e) {
        json_response([
            'success' => false,
            'message' => 'Storage error: ' . $e->getMessage(),
        ], 500);
    }

    json_response([
        'success' => true,
        'asset' => $asset,
    ]);
}

json_response([
    'success' => false,
    'message' => 'Method not allowed',
], 405);
