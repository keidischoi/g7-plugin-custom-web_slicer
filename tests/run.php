<?php

/**
 * 🔪 웹 슬라이서 구조 검사 — Laravel 없이: php tests/run.php
 * 버전 · 경로 · 파일 내주기 규칙 · 빌드 결과 · 라이선스 표시
 */

declare(strict_types=1);

$root = dirname(__DIR__);
$pass = 0;
$fail = 0;
function ok(bool $c, string $m): void
{
    global $pass, $fail;
    $c ? $pass++ : $fail++;
    echo ($c ? '  ok   ' : '  FAIL ').$m."\n";
}
$plugin = json_decode((string) file_get_contents($root.'/plugin.json'), true);
$ver = (string) ($plugin['version'] ?? '');
$composer = json_decode((string) file_get_contents($root.'/composer.json'), true);
ok($plugin['identifier'] === 'custom-web_slicer' && $ver !== '' && ($composer['version'] ?? '') === $ver, 'plugin.json · composer.json 버전 같음 ('.$ver.')');
ok(($plugin['license'] ?? '') === 'AGPL-3.0-or-later' && ($composer['license'] ?? '') === 'AGPL-3.0-or-later' && str_contains((string) file_get_contents($root.'/LICENSE'), 'GNU AFFERO GENERAL PUBLIC LICENSE'), 'AGPL 라이선스 표시 · LICENSE');
ok(str_contains((string) file_get_contents($root.'/CHANGELOG.md'), '## '.$ver), 'CHANGELOG 에 지금 버전');
$loader = (string) file_get_contents($root.'/resources/js/web_slicer.js');
ok($loader === (string) @file_get_contents($root.'/dist/js/plugin.iife.js') && str_contains($loader, "V = '".$ver."'") && str_contains($loader, 'custom-web_slicer '.$ver), '불러오기 스크립트 = 번들 · 버전');
ok(str_contains($loader, "querySelector('[data-wsl-app]')") && str_contains($loader, "s.type = 'module'"), '불러오기: 슬라이서 화면에서만 앱(모듈)을 받음');
$app = (string) file_get_contents($root.'/web/src/app.js');
ok(str_contains($app, "V = '".$ver."'") && str_contains($app, 'custom-web_slicer '.$ver), '앱 버전');
ok(str_contains($app, "'/printers/' + p.id + '/send-file'") && str_contains($app, "fd.append('bed_clear', '1')") && str_contains($app, "data-bed"), '보내기: 프린터 라운지 send-file · 베드 확인 체크');
ok(str_contains($app, 'github.com/keidischoi/g7-plugin-custom-web_slicer') && str_contains($app, 'AGPL-3.0'), '화면에 소스 링크 · AGPL');
$layout = json_decode((string) file_get_contents($root.'/resources/layouts/user/web_slicer.json'), true);
ok(($layout['layout_name'] ?? '') === 'web_slicer' && ($layout['slots']['content'][0]['props']['data-wsl-app'] ?? '') === '1', '사용자 레이아웃 · 앱 자리');
$routes = (string) file_get_contents($root.'/src/routes/api.php');
ok(str_contains($routes, "Route::get('assets/{file}'") && str_contains($routes, '(js|css|json|wasm|txt)'), 'API: assets 만');
$asset = (string) file_get_contents($root.'/src/Http/Controllers/AssetController.php');
ok(str_contains($asset, "'/dist/web/'") && str_contains($asset, "str_contains(\$file, '..')"), '파일 내주기: dist/web 안만 · 경로 밖으로 못 나감');
// 파일 이름 규칙 흉내
$re = '/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,80}\.(js|css|json|wasm|txt)$/';
ok(preg_match($re, 'c-EFFSTYQX.js') === 1 && preg_match($re, 'app.css') === 1 && preg_match($re, '../plugin.php') === 0 && preg_match($re, '.env') === 0 && preg_match($re, 'a/b.js') === 0, '파일 이름 규칙 (조각 · css 는 됨, 경로 · 숨은 파일은 안 됨)');
$dist = $root.'/dist/web';
$files = is_dir($dist) ? scandir($dist) : [];
ok(in_array('app.js', $files, true) && in_array('worker.js', $files, true) && in_array('app.css', $files, true) && in_array('three-slicer-LICENSE.txt', $files, true), '빌드 결과: app.js · worker.js · app.css · 엔진 라이선스');
$bad = array_filter($files, static fn ($f) => $f !== '.' && $f !== '..' && preg_match($re, $f) !== 1);
ok($bad === [], '빌드 결과 파일 이름이 모두 내주기 규칙에 맞음'.($bad ? ' — '.implode(', ', $bad) : ''));
$appJs = (string) @file_get_contents($dist.'/app.js');
ok(str_contains($appJs, 'worker.js?v=') && str_contains($appJs, $ver), '빌드된 앱: worker 주소 · 버전');
ok(str_contains((string) file_get_contents($root.'/plugin.php'), "RouteListener::class, MenuListener::class") && str_contains((string) file_get_contents($root.'/src/Listeners/RouteListener.php'), "'/slicer'"), '화면 주소 /slicer · 메뉴');
foreach (['plugin.php', 'src/Listeners/RouteListener.php', 'src/Listeners/MenuListener.php', 'src/Http/Controllers/AssetController.php', 'src/routes/api.php'] as $f) {
    $o = [];
    $c = 0;
    exec('php -l '.escapeshellarg($root.'/'.$f).' 2>&1', $o, $c);
    ok($c === 0, 'PHP 문법 '.$f);
}
echo "\n".($fail ? "FAIL $fail / " : 'OK ').($pass + $fail)."\n";
exit($fail ? 1 : 0);
