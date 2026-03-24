<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

require_auth_user();

$from = isset($_GET['from']) ? trim((string) $_GET['from']) : '';
$to = isset($_GET['to']) ? trim((string) $_GET['to']) : '';

function is_valid_ymd(string $d): bool
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) {
        return false;
    }
    [$y, $m, $day] = array_map('intval', explode('-', $d));
    return checkdate($m, $day, $y);
}

$from = is_valid_ymd($from) ? $from : '';
$to = is_valid_ymd($to) ? $to : '';

function in_range(string $date, string $from, string $to): bool
{
    if ($from !== '' && $date < $from) return false;
    if ($to !== '' && $date > $to) return false;
    return true;
}

function ics_escape(string $s): string
{
    $s = str_replace("\\r", '', $s);
    $s = str_replace("\\n", "\\n", $s);
    $s = str_replace('\\', '\\\\', $s);
    $s = str_replace(';', '\\;', $s);
    $s = str_replace(',', '\\,', $s);
    return $s;
}

function ics_line(string $line): string
{
    $out = '';
    $max = 75;
    while (strlen($line) > $max) {
        $out .= substr($line, 0, $max) . "\r\n";
        $line = ' ' . substr($line, $max);
    }
    $out .= $line;
    return $out;
}

function iso_to_utc_dt(string $iso): string
{
    try {
        $dt = new DateTimeImmutable($iso);
    } catch (Throwable $e) {
        $dt = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    }
    $dt = $dt->setTimezone(new DateTimeZone('UTC'));
    return $dt->format('Ymd\THis\Z');
}

function date_to_ics(string $date): string
{
    $d = preg_replace('/[^0-9-]/', '', $date);
    return str_replace('-', '', (string) $d);
}

function next_date(string $date): string
{
    try {
        $dt = new DateTimeImmutable($date . 'T00:00:00', new DateTimeZone('UTC'));
        return $dt->modify('+1 day')->format('Y-m-d');
    } catch (Throwable $e) {
        return $date;
    }
}

function time_to_hhmmss(string $time): string
{
    $t = trim($time);
    if ($t === '') return '000000';
    // accept HH:MM or HH:MM:SS
    $parts = explode(':', $t);
    $h = isset($parts[0]) ? str_pad(preg_replace('/\D/', '', $parts[0]), 2, '0', STR_PAD_LEFT) : '00';
    $m = isset($parts[1]) ? str_pad(preg_replace('/\D/', '', $parts[1]), 2, '0', STR_PAD_LEFT) : '00';
    $s = isset($parts[2]) ? str_pad(preg_replace('/\D/', '', $parts[2]), 2, '0', STR_PAD_LEFT) : '00';
    return $h . $m . $s;
}

function dt_from_date_time_local(string $date, string $time, ?DateTimeZone $tz): string
{
    $tz = $tz ?: new DateTimeZone('Europe/Berlin');
    try {
        $dt = new DateTimeImmutable($date . 'T' . $time, $tz);
    } catch (Throwable $e) {
        $dt = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    }
    $dt = $dt->setTimezone(new DateTimeZone('UTC'));
    return $dt->format('Ymd\THis\Z');
}

function load_collection_items(string $name): array
{
    $file = DATA_ROOT . '/shared/collections/' . $name . '.json';
    $store = read_json_file($file, ['items' => []]);
    if (!is_array($store) || !isset($store['items']) || !is_array($store['items'])) {
        return [];
    }
    return $store['items'];
}

function build_profile_lookup(): array
{
    $store = get_users_store();
    $out = [];
    foreach (($store['users'] ?? []) as $user) {
        if (!is_array($user)) continue;
        $id = isset($user['id']) && (string) $user['id'] !== '' ? (string) $user['id'] : user_id_from_email((string) ($user['email'] ?? ''));
        $name = isset($user['displayName']) && (string) $user['displayName'] !== '' ? (string) $user['displayName'] : (string) ($user['email'] ?? $id);
        $out[$id] = $name;
    }

    // Known IDs from migrated Supabase profiles
    if (!isset($out['0d57db28-7e41-4a50-b3ea-2b3fc0708750'])) {
        $out['0d57db28-7e41-4a50-b3ea-2b3fc0708750'] = 'Lisa';
    }
    if (!isset($out['75a87153-16f4-4517-9b90-30502b190235'])) {
        $out['75a87153-16f4-4517-9b90-30502b190235'] = 'Martin';
    }

    return $out;
}

$tz = new DateTimeZone('Europe/Berlin');
$profiles = build_profile_lookup();

$events = [];
$nowStamp = iso_to_utc_dt('now');

// care_assignments -> all-day
foreach (load_collection_items('care_assignments') as $it) {
    if (!is_array($it)) continue;
    $date = isset($it['date']) ? (string) $it['date'] : '';
    $caretakerId = isset($it['caretaker_id']) ? (string) $it['caretaker_id'] : '';
    if ($date === '' || $caretakerId === '') continue;
    if (!in_range($date, $from, $to)) continue;

    $name = $profiles[$caretakerId] ?? $caretakerId;
    $uid = (string) (($it['id'] ?? '') !== '' ? $it['id'] : sha1('assign:' . $date . ':' . $caretakerId)) . '@kajacare';

    $events[] = [
        'uid' => $uid,
        'dtstamp' => $nowStamp,
        'allDay' => true,
        'dtstart' => date_to_ics($date),
        'dtend' => date_to_ics(next_date($date)),
        'summary' => 'Kaja bei ' . $name,
        'description' => '',
    ];
}

// availability -> all-day absence
foreach (load_collection_items('availability') as $it) {
    if (!is_array($it)) continue;
    $date = isset($it['date']) ? (string) $it['date'] : '';
    $userId = isset($it['user_id']) ? (string) $it['user_id'] : '';
    $status = isset($it['status']) ? (string) $it['status'] : '';
    if ($date === '' || $userId === '') continue;
    if (!in_range($date, $from, $to)) continue;

    $name = $profiles[$userId] ?? $userId;
    $uid = (string) (($it['id'] ?? '') !== '' ? $it['id'] : sha1('absence:' . $date . ':' . $userId)) . '@kajacare';

    $summary = 'Abwesenheit: ' . $name;
    if ($status !== '') {
        $summary .= ' (' . $status . ')';
    }

    $events[] = [
        'uid' => $uid,
        'dtstamp' => $nowStamp,
        'allDay' => true,
        'dtstart' => date_to_ics($date),
        'dtend' => date_to_ics(next_date($date)),
        'summary' => $summary,
        'description' => '',
    ];
}

// handovers -> timed
foreach (load_collection_items('handovers') as $it) {
    if (!is_array($it)) continue;
    $date = isset($it['date']) ? (string) $it['date'] : '';
    if ($date === '') continue;
    if (!in_range($date, $from, $to)) continue;

    $time = isset($it['time']) && (string) $it['time'] !== '' ? (string) $it['time'] : '12:00';
    $fromId = isset($it['from_user_id']) ? (string) $it['from_user_id'] : '';
    $toId = isset($it['to_user_id']) ? (string) $it['to_user_id'] : '';

    $fromName = $fromId !== '' ? ($profiles[$fromId] ?? $fromId) : '—';
    $toName = $toId !== '' ? ($profiles[$toId] ?? $toId) : '—';

    $uid = (string) (($it['id'] ?? '') !== '' ? $it['id'] : sha1('handover:' . $date . ':' . $time . ':' . $fromId . ':' . $toId)) . '@kajacare';

    $start = dt_from_date_time_local($date, substr($time, 0, 5) . ':00', $tz);
    try {
        $endDt = (new DateTimeImmutable($date . 'T' . substr($time, 0, 5) . ':00', $tz))->modify('+30 minutes')->setTimezone(new DateTimeZone('UTC'));
        $end = $endDt->format('Ymd\THis\Z');
    } catch (Throwable $e) {
        $end = $start;
    }

    $events[] = [
        'uid' => $uid,
        'dtstamp' => $nowStamp,
        'allDay' => false,
        'dtstart' => $start,
        'dtend' => $end,
        'summary' => 'Übergabe: ' . $fromName . ' → ' . $toName,
        'description' => '',
    ];
}

// care_day_events -> timed if time exists, else all-day
foreach (load_collection_items('care_day_events') as $it) {
    if (!is_array($it)) continue;
    $date = isset($it['date']) ? (string) $it['date'] : '';
    $title = isset($it['title']) ? (string) $it['title'] : '';
    $time = isset($it['time']) ? (string) $it['time'] : '';
    if ($date === '' || $title === '') continue;
    if (!in_range($date, $from, $to)) continue;

    $uid = (string) (($it['id'] ?? '') !== '' ? $it['id'] : sha1('event:' . $date . ':' . $title . ':' . $time)) . '@kajacare';

    $descParts = [];
    if (isset($it['location']) && (string) $it['location'] !== '') $descParts[] = 'Ort: ' . (string) $it['location'];
    if (isset($it['notes']) && (string) $it['notes'] !== '') $descParts[] = (string) $it['notes'];
    $desc = implode("\n", $descParts);

    if ($time !== '') {
        $start = dt_from_date_time_local($date, substr($time, 0, 5) . ':00', $tz);
        try {
            $endDt = (new DateTimeImmutable($date . 'T' . substr($time, 0, 5) . ':00', $tz))->modify('+60 minutes')->setTimezone(new DateTimeZone('UTC'));
            $end = $endDt->format('Ymd\THis\Z');
        } catch (Throwable $e) {
            $end = $start;
        }

        $events[] = [
            'uid' => $uid,
            'dtstamp' => $nowStamp,
            'allDay' => false,
            'dtstart' => $start,
            'dtend' => $end,
            'summary' => $title,
            'description' => $desc,
        ];
    } else {
        $events[] = [
            'uid' => $uid,
            'dtstamp' => $nowStamp,
            'allDay' => true,
            'dtstart' => date_to_ics($date),
            'dtend' => date_to_ics(next_date($date)),
            'summary' => $title,
            'description' => $desc,
        ];
    }
}

// short_visits -> timed
foreach (load_collection_items('short_visits') as $it) {
    if (!is_array($it)) continue;
    $date = isset($it['date']) ? (string) $it['date'] : '';
    $visitorId = isset($it['visitor_id']) ? (string) $it['visitor_id'] : '';
    if ($date === '' || $visitorId === '') continue;
    if (!in_range($date, $from, $to)) continue;

    $startTime = isset($it['start_time']) ? (string) $it['start_time'] : '';
    if ($startTime === '') continue;

    $endTime = isset($it['end_time']) ? (string) $it['end_time'] : '';
    $durationMinutes = isset($it['duration_minutes']) ? (int) $it['duration_minutes'] : 0;

    $visitorName = $profiles[$visitorId] ?? $visitorId;
    $visitType = isset($it['visit_type']) ? (string) $it['visit_type'] : '';

    $uid = (string) (($it['id'] ?? '') !== '' ? $it['id'] : sha1('visit:' . $date . ':' . $visitorId . ':' . $startTime)) . '@kajacare';

    $start = dt_from_date_time_local($date, substr($startTime, 0, 5) . ':00', $tz);
    if ($endTime !== '') {
        $end = dt_from_date_time_local($date, substr($endTime, 0, 5) . ':00', $tz);
    } else {
        try {
            $dur = $durationMinutes > 0 ? $durationMinutes : 30;
            $endDt = (new DateTimeImmutable($date . 'T' . substr($startTime, 0, 5) . ':00', $tz))->modify('+' . $dur . ' minutes')->setTimezone(new DateTimeZone('UTC'));
            $end = $endDt->format('Ymd\THis\Z');
        } catch (Throwable $e) {
            $end = $start;
        }
    }

    $summary = 'Kurzbesuch: ' . $visitorName;
    if ($visitType !== '') {
        $summary .= ' (' . $visitType . ')';
    }

    $events[] = [
        'uid' => $uid,
        'dtstamp' => $nowStamp,
        'allDay' => false,
        'dtstart' => $start,
        'dtend' => $end,
        'summary' => $summary,
        'description' => '',
    ];
}

// care_day_notes -> all-day note events (optional but requested: all infos)
foreach (load_collection_items('care_day_notes') as $it) {
    if (!is_array($it)) continue;
    $date = isset($it['date']) ? (string) $it['date'] : '';
    $title = isset($it['title']) ? (string) $it['title'] : '';
    if ($date === '' || $title === '') continue;
    if (!in_range($date, $from, $to)) continue;

    $createdBy = isset($it['created_by']) ? (string) $it['created_by'] : '';
    $author = $createdBy !== '' ? ($profiles[$createdBy] ?? $createdBy) : '';

    $uid = (string) (($it['id'] ?? '') !== '' ? $it['id'] : sha1('note:' . $date . ':' . $title)) . '@kajacare';

    $descParts = [];
    if ($author !== '') $descParts[] = 'Von: ' . $author;
    if (isset($it['content']) && (string) $it['content'] !== '') $descParts[] = (string) $it['content'];
    $desc = implode("\n", $descParts);

    $events[] = [
        'uid' => $uid,
        'dtstamp' => $nowStamp,
        'allDay' => true,
        'dtstart' => date_to_ics($date),
        'dtend' => date_to_ics(next_date($date)),
        'summary' => 'Notiz: ' . $title,
        'description' => $desc,
    ];
}

// care_day_preferences -> all-day preference events
foreach (load_collection_items('care_day_preferences') as $it) {
    if (!is_array($it)) continue;
    $date = isset($it['date']) ? (string) $it['date'] : '';
    $profileId = isset($it['profile_id']) ? (string) $it['profile_id'] : '';
    $level = isset($it['preference_level']) ? (string) $it['preference_level'] : '';
    if ($date === '' || $profileId === '' || $level === '') continue;
    if (!in_range($date, $from, $to)) continue;

    $name = $profiles[$profileId] ?? $profileId;

    $uid = (string) (($it['id'] ?? '') !== '' ? $it['id'] : sha1('pref:' . $date . ':' . $profileId . ':' . $level)) . '@kajacare';

    $reason = isset($it['reason']) ? (string) $it['reason'] : '';
    $desc = $reason !== '' ? ('Grund: ' . $reason) : '';

    $events[] = [
        'uid' => $uid,
        'dtstamp' => $nowStamp,
        'allDay' => true,
        'dtstart' => date_to_ics($date),
        'dtend' => date_to_ics(next_date($date)),
        'summary' => 'Wunsch: ' . $name . ' (' . $level . ')',
        'description' => $desc,
    ];
}

// Sort by DTSTART for nicer imports (optional)
usort($events, function ($a, $b) {
    $as = (string) ($a['dtstart'] ?? '');
    $bs = (string) ($b['dtstart'] ?? '');
    return strcmp($as, $bs);
});

$lines = [];
$lines[] = 'BEGIN:VCALENDAR';
$lines[] = 'VERSION:2.0';
$lines[] = 'PRODID:-//KajaCare//Calendar Export//DE';
$lines[] = 'CALSCALE:GREGORIAN';
$lines[] = 'METHOD:PUBLISH';
$lines[] = 'X-WR-CALNAME:' . ics_escape('KajaCare');
$lines[] = 'X-WR-TIMEZONE:Europe/Berlin';

foreach ($events as $ev) {
    $lines[] = 'BEGIN:VEVENT';
    $lines[] = 'UID:' . ics_escape((string) $ev['uid']);
    $lines[] = 'DTSTAMP:' . ics_escape((string) $ev['dtstamp']);

    if (!empty($ev['allDay'])) {
        $lines[] = 'DTSTART;VALUE=DATE:' . ics_escape((string) $ev['dtstart']);
        $lines[] = 'DTEND;VALUE=DATE:' . ics_escape((string) $ev['dtend']);
    } else {
        $lines[] = 'DTSTART:' . ics_escape((string) $ev['dtstart']);
        $lines[] = 'DTEND:' . ics_escape((string) $ev['dtend']);
    }

    $lines[] = 'SUMMARY:' . ics_escape((string) $ev['summary']);
    if (isset($ev['description']) && (string) $ev['description'] !== '') {
        $lines[] = 'DESCRIPTION:' . ics_escape((string) $ev['description']);
    }

    $lines[] = 'END:VEVENT';
}

$lines[] = 'END:VCALENDAR';

$out = '';
foreach ($lines as $l) {
    $out .= ics_line($l) . "\r\n";
}

header('Content-Type: text/calendar; charset=utf-8');
header('Content-Disposition: attachment; filename="kajacare-calendar.ics"');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

echo $out;
