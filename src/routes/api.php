<?php

use Illuminate\Support\Facades\Route;
use Plugins\Custom\WebSlicer\Http\Controllers\AssetController;

/*
| PluginRouteServiceProvider prefix: api/plugins/custom-web_slicer
| 모델 파일은 서버로 오지 않음 — 회원 브라우저에서 슬라이스 (dist/web/*)
| 내 프린터로 보내기는 프린터 라운지 API (api/plugins/custom-my_printer/printers/{id}/send-file) 를 브라우저가 바로 부름
*/

Route::get('assets/{file}', [AssetController::class, 'show'])
    ->where('file', '[A-Za-z0-9_-][A-Za-z0-9_.-]{0,80}\.(js|css|json|wasm|txt)')->middleware('throttle:600,1')->name('assets');
