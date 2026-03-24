<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

require_auth_user();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$name = isset($_GET['name']) ? trim((string) $_GET['name']) : '';

$allowed = [
    'care_assignments',
    'care_day_preferences',
    'care_day_events',
    'care_day_notes',
    'handovers',
    'availability',
    'short_visits',
    'activity_log',
    'messages',
    'requests',
    'expenses',
    'logbook_entries',
];

if ($name === '' || !in_array($name, $allowed, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid collection name',
        'allowed' => $allowed,
    ], 400);
}

$dir = DATA_ROOT . '/shared/collections';
if (!is_dir($dir)) {
    @mkdir($dir, 0777, true);
}

$file = $dir . '/' . $name . '.json';

$store = read_json_file($file, [
    'version' => 1,
    'updatedAt' => time(),
    'items' => [],
]);

if (!is_array($store)) {
    $store = ['version' => 1, 'updatedAt' => time(), 'items' => []];
}
if (!isset($store['items']) || !is_array($store['items'])) {
    $store['items'] = [];
}

$items = $store['items'];

function matches_filter(array $item, array $filter): bool
{
    foreach ($filter as $k => $v) {
        if (!array_key_exists($k, $item)) {
            return false;
        }
        $iv = $item[$k];
        if (is_array($v)) {
            if (count($v) === 0) {
                return false;
            }
            $ok = false;
            foreach ($v as $vv) {
                if ((string) $iv === (string) $vv) {
                    $ok = true;
                    break;
                }
            }
            if (!$ok) {
                return false;
            }
        } else {
            if ((string) $iv !== (string) $v) {
                return false;
            }
        }
    }

    return true;
}

function ensure_item_id(array $item): array
{
    if (!isset($item['id']) || (string) $item['id'] === '') {
        $item['id'] = bin2hex(random_bytes(16));
    }
    return $item;
}

if ($method === 'GET') {
    $filterRaw = isset($_GET['filter']) ? (string) $_GET['filter'] : '';
    $filter = [];
    if ($filterRaw !== '') {
        $decoded = json_decode($filterRaw, true);
        if (is_array($decoded)) {
            $filter = $decoded;
        }
    }

    $out = [];
    foreach ($items as $it) {
        if (!is_array($it)) {
            continue;
        }
        if (!matches_filter($it, $filter)) {
            continue;
        }
        $out[] = $it;
    }

    json_response([
        'success' => true,
        'items' => $out,
    ]);
}

$raw = file_get_contents('php://input');
$payload = json_decode((string) $raw, true);
if (!is_array($payload)) {
    $payload = [];
}

if ($method === 'POST') {
    $inputItems = [];

    if (isset($payload['items']) && is_array($payload['items'])) {
        $inputItems = $payload['items'];
    } elseif (isset($payload['item']) && is_array($payload['item'])) {
        $inputItems = [$payload['item']];
    } elseif (is_array($payload)) {
        $inputItems = [$payload];
    }

    $keyFields = [];
    if (isset($payload['keyFields']) && is_array($payload['keyFields'])) {
        foreach ($payload['keyFields'] as $kf) {
            if (is_string($kf) && $kf !== '') {
                $keyFields[] = $kf;
            }
        }
    }

    $updated = [];

    foreach ($inputItems as $in) {
        if (!is_array($in)) {
            continue;
        }
        $in = ensure_item_id($in);

        $foundIdx = null;
        if (!empty($keyFields)) {
            foreach ($items as $idx => $existing) {
                if (!is_array($existing)) {
                    continue;
                }
                $match = true;
                foreach ($keyFields as $kf) {
                    if (!isset($existing[$kf]) || !isset($in[$kf]) || (string) $existing[$kf] !== (string) $in[$kf]) {
                        $match = false;
                        break;
                    }
                }
                if ($match) {
                    $foundIdx = $idx;
                    break;
                }
            }
        } else {
            foreach ($items as $idx => $existing) {
                if (!is_array($existing)) {
                    continue;
                }
                if (isset($existing['id']) && (string) $existing['id'] === (string) $in['id']) {
                    $foundIdx = $idx;
                    break;
                }
            }
        }

        if ($foundIdx !== null) {
            $items[$foundIdx] = array_merge((array) $items[$foundIdx], $in);
        } else {
            $items[] = $in;
        }

        $updated[] = $in;
    }

    $store['items'] = $items;
    $store['updatedAt'] = time();

    try {
        write_json_file_atomic($file, $store);
    } catch (Throwable $e) {
        json_response([
            'success' => false,
            'message' => 'Storage error: ' . $e->getMessage(),
        ], 500);
    }

    json_response([
        'success' => true,
        'items' => $updated,
    ]);
}

if ($method === 'DELETE') {
    $filter = [];
    if (isset($payload['filter']) && is_array($payload['filter'])) {
        $filter = $payload['filter'];
    } else {
        $filterRaw = isset($_GET['filter']) ? (string) $_GET['filter'] : '';
        if ($filterRaw !== '') {
            $decoded = json_decode($filterRaw, true);
            if (is_array($decoded)) {
                $filter = $decoded;
            }
        }
    }

    if (empty($filter)) {
        json_response([
            'success' => false,
            'message' => 'Delete requires filter',
        ], 400);
    }

    $kept = [];
    $deletedCount = 0;

    foreach ($items as $it) {
        if (!is_array($it)) {
            continue;
        }
        if (matches_filter($it, $filter)) {
            $deletedCount++;
            continue;
        }
        $kept[] = $it;
    }

    $store['items'] = $kept;
    $store['updatedAt'] = time();

    try {
        write_json_file_atomic($file, $store);
    } catch (Throwable $e) {
        json_response([
            'success' => false,
            'message' => 'Storage error: ' . $e->getMessage(),
        ], 500);
    }

    json_response([
        'success' => true,
        'deleted' => $deletedCount,
    ]);
}

json_response([
    'success' => false,
    'message' => 'Method not allowed',
], 405);
