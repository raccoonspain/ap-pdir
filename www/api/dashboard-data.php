<?php
declare(strict_types=1);

require_once __DIR__ . '/b24.php';

/**
 * Данные пульта руководителя: сделка → этапы (Milestone) → модули (Module),
 * с готовыми агрегатами и индикаторами. Один проход — весь REST через
 * batch(), без REST-вызовов при раскрытии строк на фронте.
 * См. docs/superpowers/specs/2026-07-13-pult-rukovoditelya-design.md.
 *
 * Поля читаются через crm.item.list — select camelCase, см.
 * rules/rule-crm-item-camelcase-select.md.
 */

const DASHBOARD_DEAL_ENTITY_TYPE_ID      = 1050;
const DASHBOARD_MILESTONE_ENTITY_TYPE_ID = 1054;
const DASHBOARD_MODULE_ENTITY_TYPE_ID    = 1062;
const DASHBOARD_PAY_ENTITY_TYPE_ID       = 1058;

const DASHBOARD_DEAL_STAGES = [
    'NEW'         => ['order' => 1, 'name' => 'Подписание'],
    'UC_WRET3K'   => ['order' => 2, 'name' => 'Авансирование'],
    'CLIENT'      => ['order' => 3, 'name' => 'Работа'],
    'PREPARATION' => ['order' => 4, 'name' => 'Закрытие'],
    'SUCCESS'     => ['order' => 5, 'name' => 'Завершено'],
    'FAIL'        => ['order' => 6, 'name' => 'Разрыв'],
];
const DASHBOARD_DEAL_EARLY_STAGES  = ['NEW', 'UC_WRET3K'];
const DASHBOARD_DEAL_CLOSED_STAGES = ['SUCCESS', 'FAIL'];

const DASHBOARD_MILESTONE_STAGES = [
    'NEW'         => 'Ожидание начала',
    'PREPARATION' => 'Авансирование',
    'CLIENT'      => 'В работе',
    'UC_OLAUWC'   => 'Передача результатов',
    'UC_PH2XT1'   => 'Оплата',
    'SUCCESS'     => 'Завершено',
    'FAIL'        => 'Разрыв',
];
const DASHBOARD_MILESTONE_SHORT_LABELS = [
    'NEW'         => 'ожид',
    'PREPARATION' => 'аванс',
    'CLIENT'      => 'раб',
    'UC_OLAUWC'   => 'передача',
    'UC_PH2XT1'   => 'опл',
    'SUCCESS'     => 'заверш',
    'FAIL'        => 'разрыв',
];
const DASHBOARD_MILESTONE_CLOSED_STAGES = ['SUCCESS', 'FAIL'];
const DASHBOARD_MILESTONE_PAYMENT_STAGE = 'UC_PH2XT1';

const DASHBOARD_MODULE_STAGES = [
    'NEW'         => 'Запуск',
    'PREPARATION' => 'Рассмотрение',
    'CLIENT'      => 'Разработка',
    'UC_WI1QUU'   => 'Корректировка',
    'UC_MTO1QJ'   => 'Ожидание',
    'UC_DFWFJU'   => 'Согласование',
    'SUCCESS'     => 'Согласовано',
    'FAIL'        => 'Аннулировано',
];
const DASHBOARD_MODULE_SHORT_LABELS = [
    'NEW'         => 'запуск',
    'PREPARATION' => 'рассм',
    'CLIENT'      => 'разр',
    'UC_WI1QUU'   => 'кор',
    'UC_MTO1QJ'   => 'ожид',
    'UC_DFWFJU'   => 'согл',
    'SUCCESS'     => 'готово',
    'FAIL'        => 'аннул',
];

const DASHBOARD_PAY_SENT_STAGE = 'UC_4NSTRS';

/** `STAGE_ID` вида `DT1050_21:NEW` → бизнес-код стадии `NEW`. */
function dashboardStageCode(?string $stageId): string {
    $stageId = (string)$stageId;
    $pos = strrpos($stageId, ':');
    return $pos === false ? $stageId : substr($stageId, $pos + 1);
}

/**
 * Постранично собирает все элементы `crm.item.list` через batch()
 * (не foreach — см. rules/rule-b24-rest-batch-not-loop.md).
 */
function dashboardFetchAllItems(B24 $b24, int $entityTypeId, array $filter, array $select): array {
    $pageSize = 50;
    $first = $b24->call('crm.item.list', [
        'entityTypeId' => $entityTypeId,
        'filter'       => $filter,
        'select'       => $select,
        'start'        => 0,
    ]);
    if (!empty($first['error'])) {
        throw new RuntimeException('crm.item.list(' . $entityTypeId . '): ' . ($first['error_description'] ?? $first['error']));
    }
    $items = $first['result']['items'] ?? [];
    $total = (int)($first['total'] ?? count($items));
    $pagesLeft = (int)ceil($total / $pageSize) - 1;
    if ($pagesLeft < 1) return $items;

    $starts = [];
    for ($p = 1; $p <= $pagesLeft; $p++) $starts[] = $p * $pageSize;

    foreach (array_chunk($starts, 50) as $chunk) {
        $cmd = [];
        foreach ($chunk as $start) {
            $cmd["p{$start}"] = ['crm.item.list', [
                'entityTypeId' => $entityTypeId,
                'filter'       => $filter,
                'select'       => $select,
                'start'        => $start,
            ]];
        }
        $batchRes = $b24->batch($cmd);
        if (!empty($batchRes['error'])) {
            throw new RuntimeException('crm.item.list batch(' . $entityTypeId . '): ' . ($batchRes['error_description'] ?? $batchRes['error']));
        }
        foreach ($batchRes['result']['result'] ?? [] as $page) {
            $items = array_merge($items, $page['items'] ?? []);
        }
    }
    return $items;
}

/** Одним REST-вызовом резолвит ID пользователей в «Имя Фамилия» (user.get, FILTER[ID]=[...]). */
function dashboardResolveUserNames(B24 $b24, array $userIds): array {
    $userIds = array_values(array_unique(array_filter(array_map('intval', $userIds))));
    if (!$userIds) return [];
    $res = $b24->call('user.get', ['FILTER' => ['ID' => $userIds]]);
    if (!empty($res['error'])) return [];
    $names = [];
    foreach ($res['result'] ?? [] as $u) {
        $name = trim(($u['NAME'] ?? '') . ' ' . ($u['LAST_NAME'] ?? ''));
        $names[(string)$u['ID']] = $name !== '' ? $name : ('#' . $u['ID']);
    }
    return $names;
}

function dashboardGroupBy(array $items, string $key): array {
    $out = [];
    foreach ($items as $item) {
        $out[(string)$item[$key]][] = $item;
    }
    return $out;
}

/** Пресет фильтруется в PHP после фетча (объём сделок небольшой — см. D-006). */
function dashboardDealMatchesPreset(string $stageCode, string $preset): bool {
    return match ($preset) {
        'closed' => in_array($stageCode, DASHBOARD_DEAL_CLOSED_STAGES, true),
        'all'    => true,
        default  => !in_array($stageCode, DASHBOARD_DEAL_CLOSED_STAGES, true),
    };
}

function dashboardEmptyResult(string $preset): array {
    return [
        'preset' => $preset,
        'kpi'    => ['activeCount' => 0, 'totalCost' => 0.0, 'brokenScheduleCount' => 0, 'awaitingPaymentCount' => 0],
        'deals'  => [],
    ];
}

/**
 * Собирает дерево сделка → этапы → модули с готовыми агрегатами.
 * $preset — 'active' (дефолт, все стадии кроме Завершено/Разрыв) / 'all' / 'closed'.
 */
function fetchDashboardData(B24 $b24, string $preset = 'active'): array {
    $dealSelect = ['id', 'title', 'stageId', 'ufCrm13OCode', 'ufCrm13OCost', 'ufCrm13OBalance'];
    $allDeals = dashboardFetchAllItems($b24, DASHBOARD_DEAL_ENTITY_TYPE_ID, [], $dealSelect);

    $deals = [];
    foreach ($allDeals as $deal) {
        $stageCode = dashboardStageCode($deal['stageId'] ?? null);
        if (dashboardDealMatchesPreset($stageCode, $preset)) {
            $deal['__stageCode'] = $stageCode;
            $deals[] = $deal;
        }
    }
    if (!$deals) return dashboardEmptyResult($preset);

    $dealIds = array_map(fn($d) => (int)$d['id'], $deals);

    $milestoneSelect = ['id', 'title', 'stageId', 'parentId1050', 'ufCrm15MstNum', 'ufCrm15MstContrPlan', 'ufCrm15MstActLast', 'ufCrm15MstActDate'];
    $milestones = dashboardFetchAllItems($b24, DASHBOARD_MILESTONE_ENTITY_TYPE_ID, ['parentId1050' => $dealIds], $milestoneSelect);

    $moduleSelect = ['id', 'title', 'stageId', 'parentId1050', 'parentId1054', 'ufCrm19ModNum', 'ufCrm19ModCreatorUser', 'ufCrm19ModActivTxtlast', 'ufCrm19ModActivDlast'];
    $modules = dashboardFetchAllItems($b24, DASHBOARD_MODULE_ENTITY_TYPE_ID, ['parentId1050' => $dealIds], $moduleSelect);

    $milestoneIds = array_map(fn($m) => (int)$m['id'], $milestones);
    $paySelect = ['id', 'stageId', 'parentId1054'];
    $pays = $milestoneIds ? dashboardFetchAllItems($b24, DASHBOARD_PAY_ENTITY_TYPE_ID, ['parentId1054' => $milestoneIds], $paySelect) : [];

    $milestonesByDeal   = dashboardGroupBy($milestones, 'parentId1050');
    $modulesByMilestone = dashboardGroupBy($modules, 'parentId1054');
    $paysByMilestone    = dashboardGroupBy($pays, 'parentId1054');

    $developerNames = dashboardResolveUserNames($b24, array_column($modules, 'ufCrm19ModCreatorUser'));

    $kpi = ['activeCount' => 0, 'totalCost' => 0.0, 'brokenScheduleCount' => 0, 'awaitingPaymentCount' => 0];
    $dealRows = [];

    foreach ($deals as $deal) {
        $stageCode  = $deal['__stageCode'];
        $isEarly    = in_array($stageCode, DASHBOARD_DEAL_EARLY_STAGES, true);
        $dealMilestones = $milestonesByDeal[(string)$deal['id']] ?? [];

        $milestoneRows        = [];
        $dealMilestoneCounts  = [];
        $dealModuleCounts     = [];
        $worstLagDays         = null;
        $brokenSchedule       = false;
        $awaitingPayment      = false;

        foreach ($dealMilestones as $m) {
            $mStageCode = dashboardStageCode($m['stageId'] ?? null);
            $mLabel     = DASHBOARD_MILESTONE_SHORT_LABELS[$mStageCode] ?? $mStageCode;
            $dealMilestoneCounts[$mLabel] = ($dealMilestoneCounts[$mLabel] ?? 0) + 1;
            $mOpen = !in_array($mStageCode, DASHBOARD_MILESTONE_CLOSED_STAGES, true);

            if ($mOpen) {
                $lag = $m['ufCrm15MstContrPlan'] ?? null;
                if ($lag !== null) {
                    $lag = (float)$lag;
                    if ($worstLagDays === null || $lag < $worstLagDays) $worstLagDays = $lag;
                    if ($lag < 0) $brokenSchedule = true;
                }
                if ($mStageCode === DASHBOARD_MILESTONE_PAYMENT_STAGE) $awaitingPayment = true;
            }

            foreach ($paysByMilestone[(string)$m['id']] ?? [] as $pay) {
                if (dashboardStageCode($pay['stageId'] ?? null) === DASHBOARD_PAY_SENT_STAGE) $awaitingPayment = true;
            }

            $moduleRows = [];
            foreach ($modulesByMilestone[(string)$m['id']] ?? [] as $mod) {
                $modStageCode = dashboardStageCode($mod['stageId'] ?? null);
                $modLabel     = DASHBOARD_MODULE_SHORT_LABELS[$modStageCode] ?? $modStageCode;
                $dealModuleCounts[$modLabel] = ($dealModuleCounts[$modLabel] ?? 0) + 1;
                $moduleRows[] = [
                    'id'            => (int)$mod['id'],
                    'number'        => $mod['ufCrm19ModNum'] ?? null,
                    'title'         => $mod['title'] ?? '',
                    'stageCode'     => $modStageCode,
                    'stageName'     => DASHBOARD_MODULE_STAGES[$modStageCode] ?? $modStageCode,
                    'developer'     => $developerNames[(string)($mod['ufCrm19ModCreatorUser'] ?? '')] ?? null,
                    'lastActivity'  => $mod['ufCrm19ModActivTxtlast'] ?? null,
                    'lastActivityAt'=> $mod['ufCrm19ModActivDlast'] ?? null,
                ];
            }

            $milestoneRows[] = [
                'id'             => (int)$m['id'],
                'number'         => $m['ufCrm15MstNum'] ?? null,
                'title'          => $m['title'] ?? '',
                'stageCode'      => $mStageCode,
                'stageName'      => DASHBOARD_MILESTONE_STAGES[$mStageCode] ?? $mStageCode,
                'lagDays'        => isset($m['ufCrm15MstContrPlan']) ? (float)$m['ufCrm15MstContrPlan'] : null,
                'lastActivity'   => $m['ufCrm15MstActLast'] ?? null,
                'lastActivityAt' => $m['ufCrm15MstActDate'] ?? null,
                'modules'        => $moduleRows,
            ];
        }

        $indicators = [];
        if (!$isEarly && $brokenSchedule)  $indicators[] = 'broken_schedule';
        if (!$isEarly && $awaitingPayment) $indicators[] = 'awaiting_payment';

        $dealRows[] = [
            'id'               => (int)$deal['id'],
            'code'             => $deal['ufCrm13OCode'] ?? '',
            'title'            => $deal['title'] ?? '',
            'stageCode'        => $stageCode,
            'stageName'        => DASHBOARD_DEAL_STAGES[$stageCode]['name'] ?? $stageCode,
            'stageOrder'       => DASHBOARD_DEAL_STAGES[$stageCode]['order'] ?? 99,
            'cost'             => isset($deal['ufCrm13OCost']) ? (float)$deal['ufCrm13OCost'] : 0.0,
            'balance'          => isset($deal['ufCrm13OBalance']) ? (float)$deal['ufCrm13OBalance'] : 0.0,
            'indicators'       => $indicators,
            'lagDays'          => $isEarly ? null : $worstLagDays,
            'milestoneCounts'  => $isEarly ? null : $dealMilestoneCounts,
            'moduleCounts'     => $isEarly ? null : $dealModuleCounts,
            'milestones'       => $isEarly ? [] : $milestoneRows,
        ];

        $kpi['activeCount']++;
        $kpi['totalCost'] += $deal['ufCrm13OCost'] ?? 0.0;
        if (in_array('broken_schedule', $indicators, true))  $kpi['brokenScheduleCount']++;
        if (in_array('awaiting_payment', $indicators, true)) $kpi['awaitingPaymentCount']++;
    }

    return ['preset' => $preset, 'kpi' => $kpi, 'deals' => $dealRows];
}
