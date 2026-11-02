/*! custom-web_slicer 0.1.7 — 웹 슬라이서 화면 · AGPL-3.0-or-later · 소스: https://github.com/keidischoi/g7-plugin-custom-web_slicer
 *  엔진: three-slicer (OrcaSlicer 를 WebAssembly 로 옮긴 것, AGPL) — 이 화면을 열 때만 받음
 *  모델 읽기: model-read.cjs (출력 검사기 custom-print_check 의 계산 핵심, MIT)
 *  흐름: 파일 → 프린터 · 품질 · 필라멘트 → 슬라이스(Web Worker) → .gcode.3mf / .gcode 내려받기 · 프린터 라운지로 보내기 */
import PCMod from './model-read.cjs'
import { bambuHeader, buildGcode3mf } from './gcode3mf.js'
import { pngBytes, renderThumb } from './thumb.js'
import { createSlicerClient } from 'three-slicer/client'
import { takeHandoff, unzipModels } from './handoff.js'
  // 🌐 화면 글자 사전 — en 에 없으면 ko
  var T = {
   ko: {
    h: "시간",
    m: "분",
    has_no_stl_3mf: "」 안에 STL · 3MF · OBJ 가 없어요.",
    could_not_unzip: "ZIP 을 풀지 못했어요: ",
    reading: "」 읽는 중…",
    could_not_read_the: "파일을 읽지 못했어요: ",
    has_no_matching_printer: "」 와 같은 프린터 설정을 못 찾았어요 — 아래에서 제조사 · 모델을 골라 주세요.",
    model: "모델(",
    mm_is_bigger_than: "mm)이 이 프린터 출력 공간(",
    mm: "mm)보다 커요.",
    preparing_slicer_engine_first: "⚙️ 슬라이서 엔진 준비 중… (처음 한 번은 몇 MB 를 받아요)",
    slicing: "🔪 슬라이스 중… ",
    the_model_goes_off: "모델이 바닥판 밖으로 나가요 — 더 작은 모델이거나 다른 프린터를 골라 주세요.",
    the_engine_could_not: "엔진이 G-code 를 만들지 못했어요.",
    memory_may_have_run: " — 메모리가 모자랐을 수 있어요 (큰 모델 · 휴대폰). 컴퓨터에서 해 보세요.",
    color: "번 색",
    filament: "필라멘트",
    s: "번 — ",
    external_spool: '<option value="ext">외부 스풀</option>',
    send: "」 로 보내기</h3>",
    upload_the_gcode_3mf: ".gcode.3mf 를 프린터 라운지에 올리면, 연결 프로그램이 30초쯤 안에 받아 프린터로 올리고 출력을 시작해요.",
    upload_the_gcode_to: ".gcode 를 프린터 라운지에 올리면, 연결 프로그램이 받아 프린터로 올리고 출력을 시작해요.",
    filament_slots: '<div class="wsl-ams"><b>🎨 필라멘트 칸</b>',
    bed_is_clear_nothing: '<label class="wsl-bed"><input type="checkbox" data-bed> <span>🧹 <b>베드를 비웠어요</b> — 바닥판에 아무것도 없어요 (멀리서 출력 시작은 위험해요)</span></label>',
    close_send: '<div class="wsl-acts"><button type="button" class="wsl-btn" data-x>닫기</button><button type="button" class="wsl-btn pri" data-go disabled>📤 보내기</button></div></div>',
    uploading: "⏳ 올리는 중…",
    sent: "보냈어요.",
    see_status_in_printer: ' <a href="/my-printer">프린터 라운지에서 상태 보기 ›</a>',
    file_too_big_over: "파일이 너무 커요 — 서버의 올리기 한도를 넘었어요.",
    please_log_in: "로그인이 필요해요.",
    could_not_send: "보내지 못했어요 (",
    sent_2: "✅ 보냄",
    send_again: "📤 다시 보내기",
    sent_the_link_app: "」 로 보냈어요 — 연결 프로그램이 30초쯤 안에 받아 출력을 시작해요.",
    connection_lost: "⚠️ 연결이 끊겼어요.",
    s_2: '<optgroup label="이 프린터 추천">',
    s_3: '<optgroup label="전체">',
    web_slicer_slice_stl: '<header class="wsl-hero"><div><h1>🔪 웹 슬라이서</h1><p>STL · 3MF 를 이 브라우저에서 슬라이스해 내 프린터로 바로 보내요. 모델은 서버로 올라가지 않아요.</p></div></header>',
    see_status_in_printer_2: ' <a href="/my-printer">프린터 라운지에서 상태 보기 ›</a><button type="button" data-sent-x aria-label="닫기">✕</button></p>',
    s_1_model_file: '<section class="wsl-card"><h2><b>1</b> 모델 파일</h2>',
    mm_triangles: " mm · 삼각형 ",
    bodies: " · 물체 ",
    s_4: "개",
    colors_one_filament_per: "색 — 색마다 필라멘트 하나</span>",
    painted_multicolor_is_sliced: '<span class="wsl-warn">🎨 칠한 다색은 아직 한 색으로 슬라이스해요 (다음 버전).</span>',
    more_than: '<span class="wsl-warn">색이 ',
    colors_so_it_is: "개보다 많아 한 색으로 슬라이스해요.</span>",
    many_triangles_a_phone: '<span class="wsl-warn">삼각형이 많아요 — 휴대폰에서는 메모리가 모자라 멈출 수 있어요.</span>',
    other_part_in_zip: '<button type="button" class="wsl-btn sm" data-zipback>📦 ZIP 의 다른 조각</button> ',
    other_file: '<label class="wsl-btn sm">다른 파일<input type="file" accept=".stl,.3mf,.obj,.zip" hidden data-pick></label></div></div>',
    has: "」 안에 모델이 ",
    models_pick_one_to: '개 있어요 — 슬라이스할 것 하나를 고르세요.</p><div class="wsl-chips">',
    other_file_2: '</div><label class="wsl-btn sm">다른 파일<input type="file" accept=".stl,.3mf,.obj,.zip" hidden data-pick></label></div>',
    drop_an_stl_3mf: '<label class="wsl-drop" data-drop><input type="file" accept=".stl,.3mf,.obj,.zip" hidden data-pick><b>📂 STL · 3MF 를 끌어 놓거나 눌러서 고르세요</b><small>모델은 이 브라우저에서만 읽어요</small></label>',
    s_2_printer: '<section class="wsl-card"><h2><b>2</b> 프린터</h2>',
    data_lounge_0_choose: '" data-lounge="0">직접 고르기</button></div>',
    register_your_printer_in: '<p class="wsl-hint">프린터 라운지에 내 프린터를 등록하면 여기서 바로 고르고 보낼 수 있어요. <a href="/my-printer">프린터 라운지 ›</a></p>',
    log_in_to_send: '<p class="wsl-hint">로그인하면 프린터 라운지의 내 프린터로 바로 보낼 수 있어요.</p>',
    brand: '<div class="wsl-row"><label>제조사<select data-vendor>',
    model_2: '</select></label><label class="grow">모델<select data-printer>',
    this_printer_can_t: '<p class="wsl-hint">이 프린터는 지금 보낼 수 없어요 (연결 프로그램이 10분 넘게 소식이 없거나, 보내기를 지원하지 않는 연결). 내려받아서 쓰세요.</p>',
    s_3_settings: '<section class="wsl-card"><h2><b>3</b> 설정</h2>',
    quality_layer_height: '<label>품질 (층 높이)<div class="wsl-chips">',
    loading: '<span class="wsl-hint">불러오는 중…</span>',
    filament_2: '<div class="wsl-fils"><b>필라멘트</b>',
    i_style_background: '<span class="wsl-mc" title="모델 파일에 적힌 색 — 이 색 자리에 쓸 필라멘트를 오른쪽에서 고르세요"><i style="background:',
    model_color: "모델 색",
    infill: '<div class="wsl-row"><label>채우기<select data-infill>',
    support_tree_auto_input: '> 서포트 (나무 모양 · 자동)</label><label class="wsl-tg"><input type="checkbox" data-brim',
    brim: "> 브림 (바닥 테두리)</label></div>",
    slicing_2: "⏳ 슬라이스 중…",
    slice: "🔪 슬라이스",
    s_4_result: '<section class="wsl-card wsl-res"><h2><b>4</b> 결과</h2><div class="wsl-tiles">',
    est_time: "<div><small>예상 시간",
    approx: " (어림)",
    filament_3: "</b></div><div><small>필라멘트</small><b>",
    g_layers: " g</b></div><div><small>층</small><b>",
    slice_2: "</b></div><div><small>슬라이스</small><b>",
    s_5: "초</b></div></div>",
    s_6: "번 ",
    includes_waste_from_color: "<small>색 바꿀 때 버리는 양(프라임 타워)이 포함돼요.</small></div>",
    disabled_title_this_printer: ' disabled title="이 프린터는 지금 보낼 수 없어요"',
    send_2: "」 로 보내기",
    admin_test: ' <small class="wsl-adm">🔒 관리자 시험</small>',
    download_gcode_3mf: '<button type="button" class="wsl-btn" data-dl="3mf">⬇️ .gcode.3mf 내려받기</button>',
    download_gcode: '<button type="button" class="wsl-btn" data-dl="gcode">⬇️ .gcode 내려받기</button></div>',
    can_t_receive_files: '」 는 지금 보낼 수 없어요 — 프린터 라운지 연결 프로그램이 10분 안에 소식을 보내야 하고, 관리자 설정 「출력 파일 보내기」가 켜져 있어야 해요. <a href="/my-printer">프린터 라운지 ›</a></p>',
    while_testing_send_is: '<p class="wsl-hint">🔒 보내기는 시험하는 동안 <b>관리자에게만</b> 보여요. 회원에게는 내려받기만 보여요.</p>',
    time_weight_are_engine: '<p class="wsl-hint">예상 시간 · 무게는 엔진 계산이라 실제와 조금 다를 수 있어요. 처음 쓰는 프린터는 첫 층을 지켜봐 주세요.</p></section>',
    this_slicer_is_agpl: '<footer class="wsl-foot">이 슬라이서는 <b>AGPL-3.0</b> 오픈소스예요 — <a href="',
    target_blank_rel_noopener: '" target="_blank" rel="noopener">소스 보기</a> · 엔진 <a href="https://github.com/kimgh06/Three_Slicer" target="_blank" rel="noopener">three-slicer</a> (OrcaSlicer 를 브라우저로 옮긴 것). 품질은 Bambu Studio · OrcaSlicer 와 조금 다를 수 있어요.</footer>',
    could_not_load_slicer: "슬라이서 설정을 불러오지 못했어요: ",
    web_slicer: "🔪 웹 슬라이서",
    slice_in_this_browser: "이 브라우저에서 슬라이스 (OrcaSlicer 엔진)",
    the_file_did_not: "파일이 오지 않았어요 — 원래 화면에서 다시 눌러 주세요.",
    has_no_matching_slicer: "」 와 맞는 슬라이서 프린터 설정을 못 찾았어요 — 웹 슬라이서 화면에서 직접 골라 주세요.",
    uploading_to_printer_lounge: "📤 프린터 라운지에 올리는 중… ",
    connection_lost_please_try: "연결이 끊겼어요 — 다시 해 주세요.",
    colors: "색",
    preparing_file: '<p class="wsl-emb-wait">📦 파일을 준비하는 중…</p>',
    checking_printers_you_can: '<p class="wsl-emb-wait">🔎 보낼 수 있는 프린터를 확인하는 중…</p>',
    close: '<div class="wsl-acts"><button type="button" class="wsl-btn" data-ex>닫기</button></div>',
    no_printer_can_receive: '<p class="wsl-emb-q">지금 보낼 수 있는 프린터가 없어요</p>',
    register_your_printer_in_2: "프린터 라운지에 내 프린터를 등록하고 연결 프로그램을 켜면 여기서 바로 보낼 수 있어요.",
    log_in_to_send_2: "로그인하면 프린터 라운지의 내 프린터로 보낼 수 있어요.",
    close_go_to_printer: '<div class="wsl-acts"><button type="button" class="wsl-btn" data-ex>닫기</button><button type="button" class="wsl-btn pri" data-elounge>📡 프린터 라운지로 가기</button></div>',
    which_printer: '<p class="wsl-emb-q">어느 프린터로 보낼까요?</p><div class="wsl-eps">',
    which_slicer: '<p class="wsl-emb-q">어떤 슬라이서로 할까요?</p><div class="wsl-eps">',
    has_2: "」 안의 모델 ",
    models_which_one_to: '개 — 어느 것을 보낼까요?</p><div class="wsl-chips">',
    filament_4: '<div class="wsl-fils"><b>필라멘트',
    ams_slot: " · AMS 칸",
    external_spool_2: ">외부 스풀</option>",
    support_input_type_checkbox: '> 서포트</label><label class="wsl-tg"><input type="checkbox" data-brim',
    brim_2: "> 브림</label></div>",
    bed_is_clear_nothing_2: "> <span>🧹 <b>베드를 비웠어요</b> — 바닥판에 아무것도 없어요 (멀리서 출력 시작은 위험해요)</span></label>",
    shown_to_admins_only: '<p class="wsl-hint">🔒 시험하는 동안 관리자에게만 보여요.</p>',
    pick_printer_again_button: '<div class="wsl-acts"><button type="button" class="wsl-btn" data-eback>← 프린터 다시 고르기</button><button type="button" class="wsl-btn pri" data-ego',
    slice_and_send: ">🔪 슬라이스하고 보내기</button></div>",
    sending: "」 로 보내는 중…",
    slicing_first_time_takes: "🔪 슬라이스하는 중… (처음 한 번은 엔진을 받느라 조금 걸려요)",
    sent_3: "」 로 보냈어요</b><p>",
    est: '</p><p class="wsl-hint">예상 ',
    filament_5: " · 필라멘트 ",
    g_the_link_app: " g · 연결 프로그램이 30초쯤 안에 받아 출력을 시작해요.</p></div>",
    go_to_printer_lounge: '<p class="wsl-emb-q">프린터 라운지로 이동할까요?</p><div class="wsl-acts"><button type="button" class="wsl-btn" data-ex>여기 있기</button><button type="button" class="wsl-btn pri" data-elounge>📡 프린터 라운지로 이동</button></div>',
    printing: "🟢 출력 중",
    paused: "⏸ 멈춤",
    idle_ready: "쉬는 중 · 보낼 수 있어요",
    ready: "보낼 수 있어요",
    printing_can_t_send: "출력 중이라 지금은 못 보내요",
    link_app_silent_for: "연결 프로그램이 10분 넘게 소식이 없거나, 보내기를 지원하지 않는 연결이에요",
    waiting_for_the_file: "📨 다른 화면에서 보낸 파일을 기다리는 중… (파일을 만드는 데 조금 걸릴 수 있어요)",
    could_not_receive_the: "파일을 넘겨받지 못했어요.",
    the_file_did_not_2: "넘겨받을 파일이 오지 않았어요 — 원래 화면에서 파일을 받아 여기에 끌어 놓아 주세요."
   },
   en: {
    h: "h",
    m: "m",
    has_no_stl_3mf: "」 has no STL · 3MF · OBJ inside.",
    could_not_unzip: "Could not unzip: ",
    reading: "」 reading…",
    could_not_read_the: "Could not read the file: ",
    has_no_matching_printer: "」 has no matching printer profile — pick the brand · model below.",
    model: "Model (",
    mm_is_bigger_than: " mm) is bigger than this printer's build volume (",
    mm: " mm).",
    preparing_slicer_engine_first: "⚙️ Preparing slicer engine… (first time downloads a few MB)",
    slicing: "🔪 Slicing… ",
    the_model_goes_off: "The model goes off the bed — use a smaller model or another printer.",
    the_engine_could_not: "The engine could not make G-code.",
    memory_may_have_run: " — memory may have run out (big model · phone). Try on a computer.",
    color: " color",
    filament: "Filament",
    s: " — ",
    external_spool: '<option value="ext">External spool</option>',
    send: "」 send</h3>",
    upload_the_gcode_3mf: "Upload the .gcode.3mf to Printer Lounge; the link app picks it up in about 30 s, sends it to the printer and starts printing.",
    upload_the_gcode_to: "Upload the .gcode to Printer Lounge; the link app picks it up, sends it to the printer and starts printing.",
    filament_slots: '<div class="wsl-ams"><b>🎨 Filament slots</b>',
    bed_is_clear_nothing: '<label class="wsl-bed"><input type="checkbox" data-bed> <span>🧹 <b>Bed is clear</b> — nothing is on the bed (remote start is risky)</span></label>',
    close_send: '<div class="wsl-acts"><button type="button" class="wsl-btn" data-x>Close</button><button type="button" class="wsl-btn pri" data-go disabled>📤 Send</button></div></div>',
    uploading: "⏳ Uploading…",
    sent: "Sent.",
    see_status_in_printer: ' <a href="/my-printer">See status in Printer Lounge ›</a>',
    file_too_big_over: "File too big — over the server upload limit.",
    please_log_in: "Please log in.",
    could_not_send: "Could not send (",
    sent_2: "✅ Sent",
    send_again: "📤 Send again",
    sent_the_link_app: "」 sent — the link app picks it up in about 30 s and starts printing.",
    connection_lost: "⚠️ Connection lost.",
    s_2: '<optgroup label="Recommended for this printer">',
    s_3: '<optgroup label="All">',
    web_slicer_slice_stl: '<header class="wsl-hero"><div><h1>🔪 Web Slicer</h1><p>Slice STL · 3MF in this browser and send straight to your printer. Models are not uploaded to the server.</p></div></header>',
    see_status_in_printer_2: ' <a href="/my-printer">See status in Printer Lounge ›</a><button type="button" data-sent-x aria-label="Close">✕</button></p>',
    s_1_model_file: '<section class="wsl-card"><h2><b>1</b> Model file</h2>',
    mm_triangles: " mm · triangles ",
    bodies: " · bodies ",
    s_4: "",
    colors_one_filament_per: " colors — one filament per color</span>",
    painted_multicolor_is_sliced: '<span class="wsl-warn">🎨 Painted multicolor is sliced as one color for now (next version).</span>',
    more_than: '<span class="wsl-warn">More than ',
    colors_so_it_is: " colors, so it is sliced as one color.</span>",
    many_triangles_a_phone: '<span class="wsl-warn">Many triangles — a phone may run out of memory.</span>',
    other_part_in_zip: '<button type="button" class="wsl-btn sm" data-zipback>📦 Other part in ZIP</button> ',
    other_file: '<label class="wsl-btn sm">Other file<input type="file" accept=".stl,.3mf,.obj,.zip" hidden data-pick></label></div></div>',
    has: "」 has ",
    models_pick_one_to: ' models — pick one to slice.</p><div class="wsl-chips">',
    other_file_2: '</div><label class="wsl-btn sm">Other file<input type="file" accept=".stl,.3mf,.obj,.zip" hidden data-pick></label></div>',
    drop_an_stl_3mf: '<label class="wsl-drop" data-drop><input type="file" accept=".stl,.3mf,.obj,.zip" hidden data-pick><b>📂 Drop an STL · 3MF here or tap to choose</b><small>The model is read only in this browser</small></label>',
    s_2_printer: '<section class="wsl-card"><h2><b>2</b> Printer</h2>',
    data_lounge_0_choose: '" data-lounge="0">Choose manually</button></div>',
    register_your_printer_in: '<p class="wsl-hint">Register your printer in Printer Lounge to pick and send it here. <a href="/my-printer">Printer Lounge ›</a></p>',
    log_in_to_send: '<p class="wsl-hint">Log in to send straight to your printer in Printer Lounge.</p>',
    brand: '<div class="wsl-row"><label>Brand<select data-vendor>',
    model_2: '</select></label><label class="grow">Model<select data-printer>',
    this_printer_can_t: '<p class="wsl-hint">This printer can\'t receive files now (link app silent for 10+ min, or the link does not support sending). Download instead.</p>',
    s_3_settings: '<section class="wsl-card"><h2><b>3</b> Settings</h2>',
    quality_layer_height: '<label>Quality (layer height)<div class="wsl-chips">',
    loading: '<span class="wsl-hint">Loading…</span>',
    filament_2: '<div class="wsl-fils"><b>Filament</b>',
    i_style_background: '<span class="wsl-mc" title="Color from the model file — pick the filament for it on the right"><i style="background:',
    model_color: "Model color",
    infill: '<div class="wsl-row"><label>Infill<select data-infill>',
    support_tree_auto_input: '> Support (tree · auto)</label><label class="wsl-tg"><input type="checkbox" data-brim',
    brim: "> Brim</label></div>",
    slicing_2: "⏳ Slicing…",
    slice: "🔪 Slice",
    s_4_result: '<section class="wsl-card wsl-res"><h2><b>4</b> Result</h2><div class="wsl-tiles">',
    est_time: "<div><small>Est. time",
    approx: " (approx.)",
    filament_3: "</b></div><div><small>Filament</small><b>",
    g_layers: " g</b></div><div><small>Layers</small><b>",
    slice_2: "</b></div><div><small>Slice</small><b>",
    s_5: " s</b></div></div>",
    s_6: ": ",
    includes_waste_from_color: "<small>Includes waste from color changes (prime tower).</small></div>",
    disabled_title_this_printer: ' disabled title="This printer can\'t receive files now"',
    send_2: "」 send",
    admin_test: ' <small class="wsl-adm">🔒 admin test</small>',
    download_gcode_3mf: '<button type="button" class="wsl-btn" data-dl="3mf">⬇️ Download .gcode.3mf</button>',
    download_gcode: '<button type="button" class="wsl-btn" data-dl="gcode">⬇️ Download .gcode</button></div>',
    can_t_receive_files: '」 can\'t receive files now — the Printer Lounge link app must report within 10 min, and the admin setting "Send print files" must be on. <a href="/my-printer">Printer Lounge ›</a></p>',
    while_testing_send_is: '<p class="wsl-hint">🔒 While testing, Send is shown <b>to admins only</b>. Members see Download only.</p>',
    time_weight_are_engine: '<p class="wsl-hint">Time · weight are engine estimates and may differ a little. Watch the first layer on a new printer.</p></section>',
    this_slicer_is_agpl: '<footer class="wsl-foot">This slicer is <b>AGPL-3.0</b> open source — <a href="',
    target_blank_rel_noopener: '" target="_blank" rel="noopener">View source</a> · engine <a href="https://github.com/kimgh06/Three_Slicer" target="_blank" rel="noopener">three-slicer</a> (OrcaSlicer ported to the browser). Quality may differ a little from Bambu Studio · OrcaSlicer.</footer>',
    could_not_load_slicer: "Could not load slicer profiles: ",
    web_slicer: "🔪 Web Slicer",
    slice_in_this_browser: "Slice in this browser (OrcaSlicer engine)",
    the_file_did_not: "The file did not arrive — tap again on the original screen.",
    has_no_matching_slicer: "」 has no matching slicer printer profile — choose it on the Web Slicer screen.",
    uploading_to_printer_lounge: "📤 Uploading to Printer Lounge… ",
    connection_lost_please_try: "Connection lost — please try again.",
    colors: " colors",
    preparing_file: '<p class="wsl-emb-wait">📦 Preparing file…</p>',
    checking_printers_you_can: '<p class="wsl-emb-wait">🔎 Checking printers you can send to…</p>',
    close: '<div class="wsl-acts"><button type="button" class="wsl-btn" data-ex>Close</button></div>',
    no_printer_can_receive: '<p class="wsl-emb-q">No printer can receive files now</p>',
    register_your_printer_in_2: "Register your printer in Printer Lounge and run the link app to send from here.",
    log_in_to_send_2: "Log in to send to your printer in Printer Lounge.",
    close_go_to_printer: '<div class="wsl-acts"><button type="button" class="wsl-btn" data-ex>Close</button><button type="button" class="wsl-btn pri" data-elounge>📡 Go to Printer Lounge</button></div>',
    which_printer: '<p class="wsl-emb-q">Which printer?</p><div class="wsl-eps">',
    which_slicer: '<p class="wsl-emb-q">Which slicer?</p><div class="wsl-eps">',
    has_2: "」 has ",
    models_which_one_to: ' models — which one to send?</p><div class="wsl-chips">',
    filament_4: '<div class="wsl-fils"><b>Filament',
    ams_slot: " · AMS slot",
    external_spool_2: ">External spool</option>",
    support_input_type_checkbox: '> Support</label><label class="wsl-tg"><input type="checkbox" data-brim',
    brim_2: "> Brim</label></div>",
    bed_is_clear_nothing_2: "> <span>🧹 <b>Bed is clear</b> — nothing is on the bed (remote start is risky)</span></label>",
    shown_to_admins_only: '<p class="wsl-hint">🔒 Shown to admins only while testing.</p>',
    pick_printer_again_button: '<div class="wsl-acts"><button type="button" class="wsl-btn" data-eback>← Pick printer again</button><button type="button" class="wsl-btn pri" data-ego',
    slice_and_send: ">🔪 Slice and send</button></div>",
    sending: "」 sending…",
    slicing_first_time_takes: "🔪 Slicing… (first time takes a bit to download the engine)",
    sent_3: "」 sent</b><p>",
    est: '</p><p class="wsl-hint">Est. ',
    filament_5: " · filament ",
    g_the_link_app: " g · the link app picks it up in about 30 s and starts printing.</p></div>",
    go_to_printer_lounge: '<p class="wsl-emb-q">Go to Printer Lounge?</p><div class="wsl-acts"><button type="button" class="wsl-btn" data-ex>Stay here</button><button type="button" class="wsl-btn pri" data-elounge>📡 Go to Printer Lounge</button></div>',
    printing: "🟢 Printing",
    paused: "⏸ Paused",
    idle_ready: "Idle · ready",
    ready: "Ready",
    printing_can_t_send: "Printing — can't send now",
    link_app_silent_for: "Link app silent for 10+ min, or the link does not support sending",
    waiting_for_the_file: "📨 Waiting for the file from the other screen… (it may take a moment)",
    could_not_receive_the: "Could not receive the file.",
    the_file_did_not_2: "The file did not arrive — download it on the original screen and drop it here."
   }
  };
  function __loc() { try { return String(localStorage.getItem('g7_locale') || document.documentElement.lang || 'ko').slice(0, 2); } catch (e) { return 'ko'; } }
  function tr(k, v) { var d = T[__loc()] || T.ko; var s = d[k] != null ? d[k] : (T.ko[k] != null ? T.ko[k] : k); return v ? s.replace(/\{(\w+)\}/g, function (m, x) { return v[x] != null ? String(v[x]) : m; }) : s; }


const V = '0.1.7', LOUNGE = '/api/plugins/custom-my_printer', SRC = 'https://github.com/keidischoi/g7-plugin-custom-web_slicer'
const PC = (PCMod && PCMod.read) ? PCMod : self.PCCore
const MAX_TOOLS = 8, BIG_TRIS = 400000
const SEND_ADMIN_ONLY = true   // 0.1.1 「📤 내 프린터로 보내기」는 시험하는 동안 관리자에게만 (실제 프린터에서 확인되면 false 로)
const VENDOR_NAME = { BBL: 'Bambu Lab' }

/* ───────── 작은 도구 ───────── */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const n1 = (v) => (Math.round(v * 10) / 10).toLocaleString()
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
const dur = (s) => { s = Math.max(0, Math.round(s / 60)); const h = Math.floor(s / 60), m = s % 60; return h ? h + tr('h') + (m ? ' ' + m + tr('m') : '') : Math.max(1, m) + tr('m') }
const scalar = (v) => (Array.isArray(v) ? v[0] : v)
function token() {
  let t = ''
  try { if (window.G7Core && G7Core.api && typeof G7Core.api.getToken === 'function') t = G7Core.api.getToken() || '' } catch (e) {}
  if (!t) { try { t = localStorage.getItem('auth_token') || '' } catch (e) {} }
  t = String(t).replace(/^"+|"+$/g, '')
  return !t || t === 'undefined' || t === 'null' ? '' : t
}
function headers() {
  const h = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, t = token()
  if (t) h.Authorization = 'Bearer ' + t
  return h
}
function hexDist(a, b) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
  if (!/^#[0-9a-f]{6}/i.test(a || '') || !/^#[0-9a-f]{6}/i.test(b || '')) return 1e9
  const x = p(a), y = p(b)
  return (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2
}

/**
 * G-code 로 출력 시간 어림 (초) — 엔진이 다색일 때 예상 시간을 주지 않아서. 이동 거리 ÷ 속도 + 기다림(G4) + 색 바꿈(M620 S…)마다 swapSec.
 *  가속은 안 셈 (실제보다 조금 짧게 나옴)
 */
function estimateSeconds(g, swapSec = 50) {
  let x = 0, y = 0, z = 0, f = 3000, t = 0, swaps = 0, i = 0
  const L = g.length
  while (i < L) {
    let j = g.indexOf('\n', i); if (j < 0) j = L
    const c0 = g.charCodeAt(i), c1 = g.charCodeAt(i + 1)
    if (c0 === 71 && (c1 === 48 || c1 === 49) && (g.charCodeAt(i + 2) === 32 || g.charCodeAt(i + 2) === 9)) {   // G0 · G1
      let k = i + 3, nx = x, ny = y, nz = z
      while (k < j) {
        const ch = g.charCodeAt(k)
        if (ch === 59) break   // ; 주석
        if (ch === 88 || ch === 89 || ch === 90 || ch === 70) {
          let e = k + 1; while (e < j && g.charCodeAt(e) !== 32 && g.charCodeAt(e) !== 59) e++
          const v = parseFloat(g.slice(k + 1, e))
          if (!isNaN(v)) { if (ch === 88) nx = v; else if (ch === 89) ny = v; else if (ch === 90) nz = v; else f = v }
          k = e
        } else k++
      }
      const d = Math.hypot(nx - x, ny - y, nz - z)
      if (d > 0 && f > 0) t += d / (f / 60)
      x = nx; y = ny; z = nz
    } else if (c0 === 71 && c1 === 52 && g.charCodeAt(i + 2) === 32) {   // G4 S초 · P밀리초
      const m = /([SP])(\d+(?:\.\d+)?)/.exec(g.slice(i, j)); if (m) t += m[1] === 'S' ? +m[2] : +m[2] / 1000
    } else if (c0 === 77 && g.startsWith('M620 S', i) && !g.startsWith('M620 S255', i)) swaps++
    i = j + 1
  }
  return t + swaps * swapSec
}

/* ───────── 상태 ───────── */
const S = {
  file: null, tris: null, info: null, plan: null, thumb: null,
  lounge: [], loggedIn: false, pid: 0, admin: false,              // 프린터 라운지 내 프린터 · 고른 것 (0 = 없음)
  vendor: 'BBL', printer: 'Bambu Lab A1 0.4 nozzle', process: '', fil: [],
  infill: 15, support: false, brim: false,
  busy: false, prog: 0, result: null, msg: '', err: '', sent: '',
  zip: null,                                                      // 0.1.4 ZIP 안의 모델들 {name, list:[{name, data}]} — 하나 고르기
  // 0.1.5 팝업(다른 화면의 「🖨️ 프린터로 보내기」) — step: wait · load · none · printers · slicer · file · set · work · sent · fail
  embed: '', step: '', ams: [], bed: false, phase: '', up: 0, done: null,
}
let ST = null, PROCS = null, FILS = null, client = null, root = null

async function engineData() {
  if (!ST) ST = await import('three-slicer/settings')
  if (!PROCS) PROCS = await ST.processPresets()
  if (!FILS) FILS = await ST.filamentPresets()
  return ST
}
const nameOf = (x) => (typeof x === 'string' ? x : x && x.name)
function processList() { try { return (PROCS.listFor(S.printer) || []).map(nameOf).filter(Boolean) } catch (e) { return [] } }
function filamentLists() {
  let rec = [], all = []
  try { rec = (FILS.recommendedFor(S.printer) || []).map(nameOf).filter(Boolean) } catch (e) {}
  try { all = (FILS.listFor(S.printer) || []).map(nameOf).filter(Boolean) } catch (e) {}
  return { rec, all: all.filter((x) => !rec.includes(x)) }
}
function printerEntry(name = S.printer) {
  const v = ST && ST.printersByVendor
  if (!v) return null
  for (const k of Object.keys(v)) if (v[k][name]) return v[k][name]
  return null
}
function defaultProcess() {
  const list = processList(), e = printerEntry()
  if (e && list.includes(e[3])) return e[3]
  return list.find((x) => /0\.20mm Standard/i.test(x)) || list[0] || ''
}
function defaultFilament(hex) {
  const { rec, all } = filamentLists(), pool = rec.length ? rec : all
  return pool.find((x) => /PLA Basic/i.test(x)) || pool.find((x) => /PLA/i.test(x)) || pool[0] || ''
}
/** 바닥 크기 [가로, 세로, 높이] — printable_area ("0x0","256x0",…) · printable_height */
function bedSize() {
  try {
    const s = ST.printerSettings(S.printer) || {}, pts = (Array.isArray(s.printable_area) ? s.printable_area : String(s.printable_area || '').split(',')).map((p) => String(p).split('x').map(Number))
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Number(scalar(s.printable_height)) || 250]
  } catch (e) { return null }
}

/** 프린터 라운지의 내 프린터 → 엔진 프린터 이름 (같은 제조사 · 모델, 0.4 노즐 먼저) */
function matchPreset(p) {
  if (!ST) return null
  const want = norm((p.brand || '') + ' ' + (p.model || '')), model = norm(p.model)
  let best = null, bs = 0
  for (const v of Object.keys(ST.printersByVendor)) {
    for (const name of Object.keys(ST.printersByVendor[v])) {
      const base = norm(name.replace(/\s*\d+(\.\d+)?\s*nozzle\s*$/i, ''))
      let sc = base === want ? 100 : model && base.endsWith(model) && base.length - model.length <= 12 ? 70 : 0
      if (!sc) continue
      if (/ 0\.4 nozzle$/i.test(name)) sc += 5
      if (sc > bs) { bs = sc; best = [v, name] }
    }
  }
  return best
}

/* ───────── 모델 ───────── */
/** 색 → 압출기 계획: 물체마다 한 색이면 색마다 압출기 하나 (칠한 다색은 아직 한 색으로) */
function planOf(t) {
  const n = t.length / 9, col = t.colors, pal = t.palette, parts = t.parts
  const hexOf = (c) => (c && pal && pal[c - 1] ? pal[c - 1].hex : '#c9ced6')
  if (!col || !pal) return { k: 1, tool: null, hexes: ['#c9ced6'], painted: false, many: false, colored: false }
  const first = new Map(), ids = [], area = new Map()
  let painted = false
  for (let i = 0; i < n; i++) {
    const c = col[i] || 0, key = parts ? parts[i] : 0
    if (!first.has(key)) first.set(key, c); else if (first.get(key) !== c) painted = true
    if (!area.has(c)) { area.set(c, 0); ids.push(c) }
    area.set(c, area.get(c) + 1)
  }
  const many = ids.length > MAX_TOOLS
  if (painted || many || ids.length < 2) {
    const top = ids.slice().sort((a, b) => area.get(b) - area.get(a))[0]
    return { k: 1, tool: null, hexes: [hexOf(top)], painted, many, colored: true }
  }
  const idx = new Map(ids.map((c, i) => [c, i])), tool = new Uint8Array(n)
  for (let i = 0; i < n; i++) tool[i] = idx.get(col[i] || 0)
  return { k: ids.length, tool, hexes: ids.map(hexOf), painted: false, many: false, colored: true }
}
/** 바이너리 STL — 가운데(x·y)를 원점에, 바닥을 z 0 에 (엔진이 판 가운데에 놓음) · 압출기마다 삼각형을 모음 */
function toStl(t, plan) {
  const n = t.length / 9
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity
  for (let i = 0; i < t.length; i += 3) { const x = t[i], y = t[i + 1], z = t[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf), counts = new Array(plan.k).fill(0)
  dv.setUint32(80, n, true)
  let w = 84
  for (let g = 0; g < plan.k; g++) {
    for (let f = 0; f < n; f++) {
      if (plan.tool && plan.tool[f] !== g) continue
      const o = f * 9
      w += 12   // 법선은 비움 (엔진이 계산)
      for (let v = 0; v < 3; v++) { dv.setFloat32(w, t[o + v * 3] - cx, true); dv.setFloat32(w + 4, t[o + v * 3 + 1] - cy, true); dv.setFloat32(w + 8, t[o + v * 3 + 2] - z0, true); w += 12 }
      w += 2; counts[g]++
    }
  }
  const splits = []
  let acc = 0
  for (let g = 0; g < plan.k - 1; g++) { acc += counts[g]; splits.push(acc) }
  return { buf, splits, tools: counts.map((_, i) => i), size: [x1 - x0, y1 - y0, (() => { let z1 = -Infinity; for (let i = 2; i < t.length; i += 3) if (t[i] > z1) z1 = t[i]; return z1 - z0 })()] }
}

async function openFile(f, fromZip) {
  S.err = ''; S.msg = ''; S.sent = ''; S.result = null; S.file = f; S.tris = null; S.plan = null; S.thumb = null; S.info = null
  if (!fromZip) S.zip = null
  if (/\.zip$/i.test(f.name)) {   // 0.1.4 자른 조각 모두 (ZIP) 등 — 안의 모델 하나를 고름
    try {
      const list = await unzipModels(await f.arrayBuffer())
      S.file = null
      if (!list.length) S.err = '「' + f.name + tr('has_no_stl_3mf')
      else if (list.length === 1) return openFile(new File([list[0].data], list[0].name), false)
      else S.zip = { name: f.name, list }
    } catch (e) { S.file = null; S.err = tr('could_not_unzip') + ((e && e.message) || e) }
    draw(); return
  }
  draw(); setStatus('📖 「' + f.name + tr('reading'))
  try {
    const t = await PC.read(f.name, await f.arrayBuffer())
    S.tris = t
    S.plan = planOf(t)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (let i = 0; i < t.length; i += 3) { if (t[i] < x0) x0 = t[i]; if (t[i] > x1) x1 = t[i]; if (t[i + 1] < y0) y0 = t[i + 1]; if (t[i + 1] > y1) y1 = t[i + 1]; if (t[i + 2] < z0) z0 = t[i + 2]; if (t[i + 2] > z1) z1 = t[i + 2] }
    S.info = { tris: t.length / 9, size: [x1 - x0, y1 - y0, z1 - z0], bodies: t.partList ? t.partList.length : 1 }
    const pal = t.palette, col = t.colors
    S.thumb = renderThumb(t, (fi) => (col && pal && col[fi] && pal[col[fi] - 1] ? pal[col[fi] - 1].hex : null), 512)
    await engineData()
    S.fil = S.plan.hexes.map((h, i) => S.fil[i] || defaultFilament(h))
    S.fil.length = S.plan.k
    setStatus('')
  } catch (e) {
    S.tris = null; S.err = tr('could_not_read_the') + (e && e.message ? e.message : e)
  }
  draw()
}

/* ───────── 프린터 라운지 ───────── */
/** 0.1.1 관리자인가 (보내기 단추) */
async function loadMe() {
  try {
    const r = await fetch('/api/plugins/custom-web_slicer/me', { headers: headers(), credentials: 'same-origin', cache: 'no-store' })
    const j = r.ok ? await r.json() : null
    S.admin = !!(j && j.data && j.data.admin)
  } catch (e) { S.admin = false }
}
const canSeeSend = () => !SEND_ADMIN_ONLY || S.admin
async function loadLounge() {
  try {
    const r = await fetch(LOUNGE + '/overview', { headers: headers(), credentials: 'same-origin' })
    if (!r.ok) return
    const j = await r.json(), d = j && j.data
    S.loggedIn = !!(d && d.logged_in)
    S.lounge = d && Array.isArray(d.mine) ? d.mine : []
    const ok = S.lounge.find((p) => p.can_send) || S.lounge[0]
    if (ok && !S.pid) pickLounge(ok.id, true)
  } catch (e) { /* 프린터 라운지가 없거나 꺼짐 — 고르기만 */ }
  draw()
}
function pickLounge(id, quiet) {
  S.pid = +id || 0
  const p = S.lounge.find((x) => +x.id === S.pid)
  if (!p || !ST) return
  const m = matchPreset(p)
  if (m) { S.vendor = m[0]; setPrinter(m[1]) } else if (!quiet) S.msg = '「' + (p.name || '') + tr('has_no_matching_printer')
}
function setPrinter(name) {
  S.printer = name
  S.process = defaultProcess()
  if (S.plan) S.fil = S.plan.hexes.map((h) => defaultFilament(h))
  S.result = null
}
const loungeP = () => S.lounge.find((x) => +x.id === S.pid) || null

/* ───────── 슬라이스 ───────── */
function settingsMap() {
  let s = { ...ST.printerSettings(S.printer) }
  if (S.process) s = ST.applyPreset(s, PROCS.settingsFor(S.process), PROCS.keys)
  const fps = (S.fil.length ? S.fil : ['']).map((nm) => (nm && FILS.settingsFor(nm)) || {})
  s = ST.applyPreset(s, fps[0], FILS.keys)
  if (fps.length > 1) {   // 압출기마다 재료 — 필라멘트 설정은 압출기 순서대로 배열
    for (const key of FILS.keys) {
      const vals = fps.map((p) => scalar(p[key]))
      if (vals.every((v) => v === undefined)) continue
      const d = vals.find((v) => v !== undefined)
      s[key] = vals.map((v) => (v === undefined ? d : v))
    }
  }
  s.filament_colour = S.plan ? S.plan.hexes.slice() : ['#c9ced6']
  s.sparse_infill_density = S.infill + '%'
  s.enable_support = !!S.support
  if (S.support) s.support_type = 'tree(auto)'
  s.brim_type = S.brim ? 'outer_only' : 'no_brim'
  if (S.brim) s.brim_width = 5
  return s
}
async function slice() {
  if (!S.tris || S.busy) return
  S.busy = true; S.prog = 0; S.err = ''; S.msg = ''; S.result = null; draw()
  try {
    await engineData()
    const plan = S.plan, stl = toStl(S.tris, plan), bed = bedSize()
    if (bed && (stl.size[0] > bed[0] + 0.5 || stl.size[1] > bed[1] + 0.5 || stl.size[2] > bed[2] + 0.5)) throw new Error(tr('model') + stl.size.map((v) => Math.round(v)).join('×') + tr('mm_is_bigger_than') + bed.map((v) => Math.round(v)).join('×') + tr('mm'))
    const s = settingsMap()
    const p = { ...ST.deriveKernelParams(s), gcode_stats_block: true, gcode_config_block: true, gcode_role_tags: true }
    if (plan.k >= 2) Object.assign(p, { extruder_count: plan.k, mm_group_split: stl.splits[0], mm_group_splits: stl.splits, mm_group_tools: stl.tools, wipe_tower_real: true })
    setStatus(tr('preparing_slicer_engine_first'))
    if (!client) client = createSlicerClient(new Worker(new URL('./worker.js?v=' + V, import.meta.url), { type: 'module' }))
    const chunks = []
    const t0 = performance.now()
    const r = await client.slice(stl.buf, p, {
      onProgress: (d, t) => { S.prog = t ? d / t : 0; setStatus(tr('slicing') + Math.round(S.prog * 100) + '%') },
      onLayer: (l) => { if (l.gcode) chunks.push(l.gcode) },
    })
    if (r.error) throw new Error(String(r.error))
    const st = r.stats || {}, warn = r.warnings || []
    if (warn.includes('over_bed_model')) throw new Error(tr('the_model_goes_off'))
    const mmBy = Array.isArray(st.filament_mm_by_tool) && st.filament_mm_by_tool.length ? st.filament_mm_by_tool : [st.filament_mm || 0]
    const dens = (i) => Number(scalar(Array.isArray(s.filament_density) ? s.filament_density[i] : s.filament_density)) || 1.24
    const tools = mmBy.map((mm, i) => ({ mm, g: mm * Math.PI * 0.875 * 0.875 * dens(i) / 1000, density: dens(i), type: String(scalar(Array.isArray(s.filament_type) ? s.filament_type[i] : s.filament_type) || 'PLA'), color: (plan.hexes[i] || '#c9ced6').toUpperCase() }))
    const bambu = /^Bambu Lab /.test(S.printer)
    const body = chunks.length ? chunks.join('') : String(r.gcode || '')   // 다색 · 실제 압력 평형 경로는 엔진이 층으로 나눠 보내지 않고 한 번에 돌려줌
    if (!body) throw new Error(tr('the_engine_could_not'))
    const seconds = st.time_estimate > 0 ? st.time_estimate : estimateSeconds(body, plan.k > 1 ? 50 : 0)   // 다색이면 엔진이 시간을 비워 둠 → G-code 로 어림
    const gcode = (bambu ? bambuHeader({ seconds, layers: st.layers || 0, maxZ: stl.size[2], tools }) : '') + body
    const base = (S.file.name || 'model').replace(/\.(stl|obj|3mf)$/i, '').replace(/\.gcode$/i, '') || 'model'
    const thumb = S.thumb ? await pngBytes(S.thumb) : null
    S.result = {
      gcode, tools, bambu, seconds, guessed: !(st.time_estimate > 0), layers: st.layers || 0, ms: Math.round(performance.now() - t0), base,
      weight: tools.reduce((a, t) => a + t.g, 0),
      gcode3mf: bambu ? buildGcode3mf({ gcode, thumb, seconds, weight: tools.reduce((a, t) => a + t.g, 0), tools, settings: s, printer: S.printer }) : null,
    }
    setStatus('')
  } catch (e) {
    S.err = (e && e.message) || String(e)
    if (/terminated|memory|OOM|out of bounds/i.test(S.err)) { S.err += tr('memory_may_have_run'); try { client && client.terminate() } catch (e2) {} client = null }
    setStatus('')
  }
  S.busy = false
  draw()
}

/* ───────── 결과 ───────── */
function download(kind) {
  const R = S.result; if (!R) return
  const blob = kind === '3mf' && R.gcode3mf ? R.gcode3mf : new Blob([R.gcode], { type: 'text/plain' })
  const a = document.createElement('a'), u = URL.createObjectURL(blob)
  a.href = u; a.download = R.base + (kind === '3mf' && R.gcode3mf ? '.gcode.3mf' : '.gcode'); document.body.appendChild(a); a.click()
  setTimeout(() => { a.remove(); URL.revokeObjectURL(u) }, 1500)
}
function sendDialog() {
  const p = loungeP(), R = S.result
  if (!p || !R || !canSeeSend() || !p.can_send) return
  const kind = p.send_kind || 'bambu', bb = kind === 'bambu'
  const ams = ((p.temps && p.temps.ams) || []).filter((a) => a.slot)
  const rows = bb && ams.length ? R.tools.map((t, i) => {
    let best = ams[0], bd = Infinity
    ams.forEach((a) => { const d = hexDist(t.color, a.color); if (d < bd) { bd = d; best = a } })
    return '<label class="wsl-amsrow"><i style="background:' + esc(t.color) + '"></i><span>' + (R.tools.length > 1 ? (i + 1) + tr('color') : tr('filament')) + ' · ' + esc(t.type) + '</span><select data-ams="' + i + '">' +
      ams.map((a) => '<option value="' + a.slot + '"' + (a === best ? ' selected' : '') + '>AMS ' + a.slot + tr('s') + esc(a.type || '') + '</option>').join('') +
      (R.tools.length === 1 ? tr('external_spool') : '') + '</select><b class="wsl-amsdot" data-amsdot="' + i + '"></b></label>'
  }).join('') : ''
  const ov = document.createElement('div'); ov.className = 'wsl-modal'
  ov.innerHTML = '<div class="wsl-dlg" role="dialog" aria-modal="true"><h3>📤 「' + esc(p.name) + tr('send') +
    '<p class="wsl-hint">' + (bb ? tr('upload_the_gcode_3mf') : tr('upload_the_gcode_to')) + '</p>' +
    (rows ? tr('filament_slots') + rows + '</div>' : '') +
    tr('bed_is_clear_nothing') +
    '<div class="wsl-prog" hidden><i></i></div><p class="wsl-dmsg" hidden></p>' +
    tr('close_send')
  document.body.appendChild(ov)
  const q = (s) => ov.querySelector(s), close = () => ov.remove()
  const dots = () => ov.querySelectorAll('[data-ams]').forEach((sel) => { const a = ams.find((x) => String(x.slot) === sel.value), d = ov.querySelector('[data-amsdot="' + sel.getAttribute('data-ams') + '"]'); if (d) d.style.background = a ? a.color || '#ccc' : 'transparent' })
  dots()
  ov.addEventListener('change', dots)
  q('[data-bed]').onchange = () => { q('[data-go]').disabled = !q('[data-bed]').checked }
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-x]')) close() })
  q('[data-go]').onclick = () => {
    const fd = new FormData()
    const blob = bb && R.gcode3mf ? R.gcode3mf : new Blob([R.gcode], { type: 'text/plain' })
    fd.append('file', blob, R.base.replace(/[^\w.-]+/g, '_').slice(0, 60) + (bb && R.gcode3mf ? '.gcode.3mf' : '.gcode'))
    fd.append('bed_clear', '1'); fd.append('plate', '1')
    const sels = ov.querySelectorAll('[data-ams]')
    if (bb && sels.length) {
      if (Array.prototype.some.call(sels, (s) => s.value === 'ext')) fd.append('use_ams', '0')
      else { fd.append('use_ams', '1'); fd.append('ams_map', JSON.stringify(Array.prototype.map.call(sels, (s) => +s.value - 1))) }
    } else fd.append('use_ams', '0')
    const go = q('[data-go]'), pr = q('.wsl-prog'), dm = q('.wsl-dmsg')
    go.disabled = true; go.textContent = tr('uploading'); pr.hidden = false
    const x = new XMLHttpRequest()
    x.open('POST', LOUNGE + '/printers/' + p.id + '/send-file'); x.withCredentials = true
    Object.entries(headers()).forEach(([k, v]) => x.setRequestHeader(k, v))
    const m = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/); if (m) x.setRequestHeader('X-XSRF-TOKEN', decodeURIComponent(m[1]))
    x.upload.onprogress = (e) => { if (e.lengthComputable) pr.firstChild.style.width = Math.round(e.loaded / e.total * 100) + '%' }
    x.onload = () => {
      let d = {}; try { d = JSON.parse(x.responseText || '{}') } catch (e) {}
      const ok = x.status >= 200 && x.status < 300 && d.success !== false
      dm.hidden = false; dm.className = 'wsl-dmsg ' + (ok ? 'ok' : 'bad')
      dm.innerHTML = ok ? '✅ ' + esc(d.message || tr('sent')) + tr('see_status_in_printer')
        : '⚠️ ' + esc(x.status === 413 ? tr('file_too_big_over') : d.message || (x.status === 401 ? tr('please_log_in') : tr('could_not_send') + x.status + ').'))
      go.textContent = ok ? tr('sent_2') : tr('send_again'); go.disabled = ok
      if (ok) {   // 0.1.3 보냈으면 잠깐 보여 주고 창을 닫음 — 화면 위에 「보냈어요」가 남음
        S.sent = '「' + p.name + tr('sent_the_link_app')
        setTimeout(() => { close(); draw(); const n = root && root.querySelector('.wsl-sent'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, 1200)
      }
    }
    x.onerror = () => { dm.hidden = false; dm.className = 'wsl-dmsg bad'; dm.textContent = tr('connection_lost'); go.disabled = false; go.textContent = tr('send_again') }
    x.send(fd)
  }
}

/* ───────── 화면 ───────── */
function setStatus(t) { const el = root && root.querySelector('[data-status]'); if (el) { el.textContent = t; el.hidden = !t } }
function vendorOptions() {
  const tech = (ST && ST.printerTechByVendor) || {}
  const v = ST ? Object.keys(ST.printersByVendor).filter((k) => tech[k] !== 'SLA') : ['BBL']
  return v.sort((a, b) => (a === 'BBL' ? -1 : b === 'BBL' ? 1 : (VENDOR_NAME[a] || a).localeCompare(VENDOR_NAME[b] || b))).map((k) => '<option value="' + esc(k) + '"' + (k === S.vendor ? ' selected' : '') + '>' + esc(VENDOR_NAME[k] || k) + '</option>').join('')
}
function modelOptions() {
  const list = ST && ST.printersByVendor[S.vendor] ? Object.keys(ST.printersByVendor[S.vendor]) : [S.printer]
  return list.map((n) => '<option' + (n === S.printer ? ' selected' : '') + '>' + esc(n) + '</option>').join('')
}
function filSelect(i) {
  const { rec, all } = filamentLists(), cur = S.fil[i] || ''
  const o = (n) => '<option' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>'
  return '<select data-fil="' + i + '">' + (rec.length ? tr('s_2') + rec.map(o).join('') + '</optgroup>' : '') + (all.length ? tr('s_3') + all.map(o).join('') + '</optgroup>' : '') + '</select>'
}
function draw() {
  if (!root) return
  if (S.embed) return drawEmbed()
  const I = S.info, P = S.plan, R = S.result, lp = loungeP()
  const procs = ST ? processList() : []
  root.innerHTML = '<div class="wsl">' +
    tr('web_slicer_slice_stl') +
    '<p class="wsl-status" data-status hidden></p>' +
    (S.err ? '<p class="wsl-err">⚠️ ' + esc(S.err) + '</p>' : '') + (S.msg ? '<p class="wsl-note">' + esc(S.msg) + '</p>' : '') +
    (S.sent ? '<p class="wsl-sent">✅ ' + esc(S.sent) + tr('see_status_in_printer_2') : '') +
    // 1. 파일
    tr('s_1_model_file') +
      (I ? '<div class="wsl-file"><div class="wsl-thumb" data-thumb></div><div><b title="' + esc(S.file.name) + '">' + esc(S.file.name) + '</b><small>' + n1(I.size[0]) + ' × ' + n1(I.size[1]) + ' × ' + n1(I.size[2]) + tr('mm_triangles') + I.tris.toLocaleString() +
        (I.bodies > 1 ? tr('bodies') + I.bodies + tr('s_4') : '') + '</small>' +
        (P && P.k > 1 ? '<span class="wsl-sw">' + P.hexes.map((h) => '<i style="background:' + esc(h) + '"></i>').join('') + ' ' + P.k + tr('colors_one_filament_per') : '') +
        (P && P.painted ? tr('painted_multicolor_is_sliced') : '') +
        (P && P.many ? tr('more_than') + MAX_TOOLS + tr('colors_so_it_is') : '') +
        (I.tris > BIG_TRIS ? tr('many_triangles_a_phone') : '') +
        (S.zip ? tr('other_part_in_zip') : '') +
        tr('other_file')
        : S.zip && !S.file ? '<div class="wsl-zip"><p>📦 「' + esc(S.zip.name) + tr('has') + S.zip.list.length + tr('models_pick_one_to') +
          S.zip.list.map((x, i) => '<button type="button" class="wsl-chip" data-zip="' + i + '">' + esc(x.name) + ' <small>' + n1(x.data.length / 1048576) + 'MB</small></button>').join('') +
          tr('other_file_2')
        : tr('drop_an_stl_3mf')) + '</section>' +
    // 2. 프린터
    tr('s_2_printer') +
      (S.lounge.length ? '<div class="wsl-chips">' + S.lounge.map((p) => '<button type="button" class="wsl-chip' + (+p.id === S.pid ? ' on' : '') + '" data-lounge="' + p.id + '">🖨️ ' + esc(p.name) + (p.can_send ? ' <em>📤</em>' : '') + '</button>').join('') + '<button type="button" class="wsl-chip' + (!S.pid ? ' on' : '') + tr('data_lounge_0_choose')
        : S.loggedIn ? tr('register_your_printer_in') : tr('log_in_to_send')) +
      tr('brand') + vendorOptions() + tr('model_2') + modelOptions() + '</select></label></div>' +
      (lp && !lp.can_send ? tr('this_printer_can_t') : '') + '</section>' +
    // 3. 설정
    tr('s_3_settings') +
      tr('quality_layer_height') + (procs.length ? procs.map((n) => '<button type="button" class="wsl-chip sm' + (n === S.process ? ' on' : '') + '" data-proc="' + esc(n) + '">' + esc(n.replace(/\s*@.*$/, '')) + '</button>').join('') : tr('loading')) + '</div></label>' +
      tr('filament_2') + (ST && FILS ? (P ? P.hexes : ['#c9ced6']).map((h, i) => '<div class="wsl-fil">' + (P && P.colored ? tr('i_style_background') + esc(h) + '"></i>' + (P.k > 1 ? (i + 1) + tr('color') : tr('model_color')) + '</span>' : '') + filSelect(i) + '</div>').join('') : tr('loading')) + '</div>' +
      tr('infill') + [5, 10, 15, 20, 25, 30, 40, 50, 100].map((v) => '<option value="' + v + '"' + (v === S.infill ? ' selected' : '') + '>' + v + '%</option>').join('') + '</select></label>' +
        '<label class="wsl-tg"><input type="checkbox" data-support' + (S.support ? ' checked' : '') + tr('support_tree_auto_input') + (S.brim ? ' checked' : '') + tr('brim') +
      '<button type="button" class="wsl-btn pri big" data-slice' + (!S.tris || S.busy ? ' disabled' : '') + '>' + (S.busy ? tr('slicing_2') : tr('slice')) + '</button>' +
      (S.busy ? '<div class="wsl-prog"><i style="width:' + Math.round(S.prog * 100) + '%"></i></div>' : '') + '</section>' +
    // 4. 결과
    (R ? tr('s_4_result') +
      tr('est_time') + (R.guessed ? tr('approx') : '') + '</small><b>' + dur(R.seconds) + tr('filament_3') + n1(R.weight) + tr('g_layers') + R.layers.toLocaleString() + tr('slice_2') + n1(R.ms / 1000) + tr('s_5') +
      (R.tools.length > 1 ? '<div class="wsl-tools">' + R.tools.map((t, i) => '<span><i style="background:' + esc(t.color) + '"></i>' + (i + 1) + tr('s_6') + n1(t.g) + ' g</span>').join('') + tr('includes_waste_from_color') : '') +
      '<div class="wsl-acts">' + (lp && canSeeSend() ? '<button type="button" class="wsl-btn pri" data-send' + (lp.can_send ? '' : tr('disabled_title_this_printer')) + '>📤 「' + esc(lp.name) + tr('send_2') + (SEND_ADMIN_ONLY ? tr('admin_test') : '') + '</button>' : '') +
      (R.gcode3mf ? tr('download_gcode_3mf') : '') + tr('download_gcode') +
      (lp && canSeeSend() && !lp.can_send ? '<p class="wsl-hint">📤 「' + esc(lp.name) + tr('can_t_receive_files') : '') +
      (SEND_ADMIN_ONLY && S.admin ? tr('while_testing_send_is') : '') +
      tr('time_weight_are_engine') : '') +
    tr('this_slicer_is_agpl') + SRC + tr('target_blank_rel_noopener') +
    '</div>'
  const th = root.querySelector('[data-thumb]'); if (th && S.thumb) { S.thumb.className = 'wsl-cv'; th.appendChild(S.thumb) }
}
function bind() {
  root.addEventListener('change', (e) => {
    const t = e.target
    if (t.matches('[data-pick]') && t.files && t.files[0]) openFile(t.files[0])
    else if (t.matches('[data-vendor]')) { S.vendor = t.value; const first = Object.keys(ST.printersByVendor[S.vendor] || {}); setPrinter(first.find((n) => / 0\.4 nozzle$/.test(n)) || first[0]); S.pid = 0; draw() }
    else if (t.matches('[data-printer]')) { setPrinter(t.value); S.pid = 0; draw() }
    else if (t.matches('[data-fil]')) { S.fil[+t.getAttribute('data-fil')] = t.value; S.result = null; draw() }
    else if (t.matches('[data-infill]')) { S.infill = +t.value; S.result = null; draw() }
    else if (t.matches('[data-support]')) { S.support = t.checked; S.result = null; draw() }
    else if (t.matches('[data-brim]')) { S.brim = t.checked; S.result = null; draw() }
    else if (t.matches('[data-eams]')) { S.ams[+t.getAttribute('data-eams')] = t.value; draw() }
    else if (t.matches('[data-ebed]')) { S.bed = t.checked; draw() }
  })
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !root.contains(b)) return
    if (b.hasAttribute('data-lounge')) { S.msg = ''; if (+b.getAttribute('data-lounge')) pickLounge(b.getAttribute('data-lounge')); else S.pid = 0; draw() }
    else if (b.hasAttribute('data-proc')) { S.process = b.getAttribute('data-proc'); S.result = null; draw() }
    else if (b.hasAttribute('data-slice')) slice()
    else if (b.hasAttribute('data-dl')) download(b.getAttribute('data-dl'))
    else if (b.hasAttribute('data-send')) sendDialog()
    else if (b.hasAttribute('data-sent-x')) { S.sent = ''; draw() }
    else if (b.hasAttribute('data-zip')) { const x = S.zip && S.zip.list[+b.getAttribute('data-zip')]; if (x) openFile(new File([x.data], x.name), true).then(() => { if (S.embed && S.tris) { S.step = 'set'; embedDefaults(); draw() } }) }
    else if (b.hasAttribute('data-ep')) embedPick(b.getAttribute('data-ep'))
    else if (b.hasAttribute('data-es')) embedSlicer(b.getAttribute('data-es'))
    else if (b.hasAttribute('data-eback')) { S.err = ''; S.step = 'printers'; draw() }
    else if (b.hasAttribute('data-ego')) embedGo()
    else if (b.hasAttribute('data-elounge')) embedClose('/my-printer')
    else if (b.hasAttribute('data-ex')) embedClose('')
    else if (b.hasAttribute('data-zipback')) { S.file = null; S.tris = null; S.info = null; S.plan = null; S.result = null; draw() }
  })
  root.addEventListener('dragover', (e) => { if (e.target.closest('[data-drop]')) { e.preventDefault(); e.target.closest('[data-drop]').classList.add('over') } })
  root.addEventListener('dragleave', (e) => { const d = e.target.closest('[data-drop]'); if (d) d.classList.remove('over') })
  root.addEventListener('drop', (e) => { const d = e.target.closest('[data-drop]'); if (!d) return; e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) openFile(f) })
}

function mount() {
  const el = document.querySelector('[data-wsl-app]')
  if (!el || el.__wsl) return
  el.__wsl = true; root = el
  if (el.getAttribute('data-wsl-embed')) { bind(); embedStart(el.getAttribute('data-wsl-embed')); return }
  if (S.embed) { S.embed = ''; S.step = ''; S.file = null; S.tris = null; S.info = null; S.plan = null; S.result = null; S.zip = null; S.err = '' }
  bind(); draw()
  handoff()
  loadMe().then(draw)
  engineData().then(() => { if (!S.process) S.process = defaultProcess(); if (!S.fil.length) S.fil = [defaultFilament()]; draw(); return loadLounge() })
    .catch((e) => { S.err = tr('could_not_load_slicer') + ((e && e.message) || e); draw() })
}
/* ───────── 0.1.5 팝업: 다른 화면의 「🖨️ 프린터로 보내기」 — 웹 슬라이서 화면 없이 그 자리에서 ───────── */
const SLICERS = () => [{ key: 'web', name: tr('web_slicer'), desc: tr('slice_in_this_browser') }].concat(Array.isArray(window.G7Slicers) ? window.G7Slicers : [])
async function embedStart(key) {
  Object.assign(S, { embed: key, step: 'wait', err: '', msg: '', sent: '', file: null, tris: null, info: null, plan: null, thumb: null, result: null, zip: null, pid: 0, ams: [], bed: false, phase: '', up: 0, done: null })
  draw()
  let f = null
  for (let i = 0; i < 240 && !f; i++) { f = window.__wslPass && window.__wslPass[key]; if (!f) await new Promise((r) => setTimeout(r, 250)) }
  if (window.__wslPass) delete window.__wslPass[key]
  if (!f || f.error) { S.err = f ? f.error : tr('the_file_did_not'); S.step = 'fail'; draw(); return }
  S.step = 'load'; draw()
  try { await engineData() } catch (e) { S.err = tr('could_not_load_slicer') + ((e && e.message) || e); S.step = 'fail'; draw(); return }
  await Promise.all([loadMe(), loadLounge()])
  S.pid = 0
  await openFile(new File([f.blob], f.name || 'model.stl', { type: f.blob.type || '' }))
  if (!S.tris && !S.zip) { S.step = 'fail'; draw(); return }
  S.step = S.lounge.some((p) => p.can_send) ? 'printers' : 'none'
  draw()
}
function embedPick(id) {
  const p = S.lounge.find((x) => +x.id === +id)
  if (!p || !p.can_send) return
  S.err = ''; S.msg = ''
  if (!matchPreset(p)) { S.err = '「' + (p.name || '') + tr('has_no_matching_slicer'); draw(); return }
  pickLounge(p.id, true)
  const list = SLICERS()
  if (list.length > 1) { S.step = 'slicer'; draw(); return }
  embedSlicer('web')
}
function embedSlicer(k) {
  const other = SLICERS().find((x) => x.key === k && x.key !== 'web')
  if (other && typeof other.open === 'function') { try { other.open({ file: S.file, printer: loungeP() }) } catch (e) {} embedClose(''); return }
  S.step = !S.tris && S.zip ? 'file' : 'set'
  if (S.step === 'set') embedDefaults()
  draw()
}
/** AMS 칸 — 색이 가장 가까운 칸으로 미리 */
function embedDefaults() {
  const p = loungeP(), ams = ((p && p.temps && p.temps.ams) || []).filter((a) => a.slot), hexes = S.plan ? S.plan.hexes : ['#c9ced6']
  S.ams = hexes.map((h, i) => {
    if (S.ams[i]) return S.ams[i]
    let best = ams[0], bd = Infinity
    ams.forEach((a) => { const d = hexDist(h, a.color); if (d < bd) { bd = d; best = a } })
    return best ? String(best.slot) : 'ext'
  })
  S.ams.length = hexes.length
}
async function embedGo() {
  const p = loungeP()
  if (!p || !S.tris || !S.bed || S.busy || S.step === 'work') return
  S.err = ''; S.step = 'work'; S.phase = 'slice'; draw()
  await slice()
  if (!S.result) { S.step = 'set'; draw(); return }
  S.phase = 'upload'; S.up = 0; S.busy = true; draw()
  const R = S.result, bb = (p.send_kind || 'bambu') === 'bambu'
  const amsOn = bb && ((p.temps && p.temps.ams) || []).some((a) => a.slot)
  const r = await upload(p, R, amsOn ? S.ams : null, (v) => { S.up = v; setStatus(tr('uploading_to_printer_lounge') + Math.round(v * 100) + '%') })
  S.busy = false
  if (!r.ok) { S.err = r.message; S.step = 'set'; draw(); return }
  S.done = { name: p.name, message: r.message, seconds: R.seconds, weight: R.weight, guessed: R.guessed }
  S.step = 'sent'; setStatus(''); draw()
}
/** .gcode.3mf(Bambu) · .gcode 를 프린터 라운지로 — ams: 색마다 'ext' 또는 AMS 칸 번호 (없으면 외부 스풀) */
function upload(p, R, ams, onProg) {
  return new Promise((done) => {
    const bb = (p.send_kind || 'bambu') === 'bambu', fd = new FormData()
    const blob = bb && R.gcode3mf ? R.gcode3mf : new Blob([R.gcode], { type: 'text/plain' })
    fd.append('file', blob, R.base.replace(/[^\w.-]+/g, '_').slice(0, 60) + (bb && R.gcode3mf ? '.gcode.3mf' : '.gcode'))
    fd.append('bed_clear', '1'); fd.append('plate', '1')
    if (bb && ams && ams.length && !ams.includes('ext')) { fd.append('use_ams', '1'); fd.append('ams_map', JSON.stringify(ams.map((v) => +v - 1))) } else fd.append('use_ams', '0')
    const x = new XMLHttpRequest()
    x.open('POST', LOUNGE + '/printers/' + p.id + '/send-file'); x.withCredentials = true
    Object.entries(headers()).forEach(([k, v]) => x.setRequestHeader(k, v))
    const m = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/); if (m) x.setRequestHeader('X-XSRF-TOKEN', decodeURIComponent(m[1]))
    x.upload.onprogress = (e) => { if (e.lengthComputable && onProg) onProg(e.loaded / e.total) }
    x.onload = () => {
      let d = {}; try { d = JSON.parse(x.responseText || '{}') } catch (e) {}
      const ok = x.status >= 200 && x.status < 300 && d.success !== false
      done({ ok, message: ok ? (d.message || tr('sent')) : (x.status === 413 ? tr('file_too_big_over') : d.message || (x.status === 401 ? tr('please_log_in') : tr('could_not_send') + x.status + ').')) })
    }
    x.onerror = () => done({ ok: false, message: tr('connection_lost_please_try') })
    x.send(fd)
  })
}
function embedClose(go) {
  const pop = root && root.closest('[data-wsl-pop]')
  S.embed = ''; S.step = ''
  if (pop) pop.remove()
  if (go) {
    try { if (window.G7Core && typeof G7Core.dispatch === 'function') { G7Core.dispatch({ handler: 'navigate', params: { path: go } }); return } } catch (e) {}
    location.href = go
  }
}
function drawEmbed() {
  const p = loungeP(), P = S.plan, I = S.info, st = S.step
  let h = '<div class="wsl wsl-emb">'
  if (I && S.file && st !== 'sent') {
    h += '<div class="wsl-file sm"><div class="wsl-thumb" data-thumb></div><div><b title="' + esc(S.file.name) + '">' + esc(S.file.name) + '</b><small>' + n1(I.size[0]) + ' × ' + n1(I.size[1]) + ' × ' + n1(I.size[2]) + ' mm' +
      (P && P.k > 1 ? ' · ' + P.k + tr('colors') : '') + '</small>' + (P && P.k > 1 ? '<span class="wsl-sw">' + P.hexes.map((c) => '<i style="background:' + esc(c) + '"></i>').join('') + '</span>' : '') + '</div></div>'
  }
  if (S.err) h += '<p class="wsl-err">⚠️ ' + esc(S.err) + '</p>'
  if (st === 'wait') h += tr('preparing_file')
  else if (st === 'load') h += tr('checking_printers_you_can')
  else if (st === 'fail') h += tr('close')
  else if (st === 'none') {
    h += tr('no_printer_can_receive') +
      (S.lounge.length ? '<div class="wsl-eps">' + S.lounge.map((x) => '<div class="wsl-ep off"><b>🖨️ ' + esc(x.name) + '</b><small>' + esc(offWhy(x)) + '</small></div>').join('') + '</div>'
        : '<p class="wsl-hint">' + (S.loggedIn ? tr('register_your_printer_in_2') : tr('log_in_to_send_2')) + '</p>') +
      tr('close_go_to_printer')
  } else if (st === 'printers') {
    h += tr('which_printer') + S.lounge.map((x) => x.can_send
      ? '<button type="button" class="wsl-ep" data-ep="' + x.id + '"><b>🖨️ ' + esc(x.name) + '</b><small>' + esc(stateTxt(x)) + '</small></button>'
      : '<div class="wsl-ep off"><b>🖨️ ' + esc(x.name) + '</b><small>' + esc(offWhy(x)) + '</small></div>').join('') + '</div>'
  } else if (st === 'slicer') {
    h += tr('which_slicer') + SLICERS().map((x) => '<button type="button" class="wsl-ep" data-es="' + esc(x.key) + '"><b>' + esc(x.name) + '</b><small>' + esc(x.desc || '') + '</small></button>').join('') + '</div>'
  } else if (st === 'file' && S.zip) {
    h += '<p class="wsl-emb-q">📦 「' + esc(S.zip.name) + tr('has_2') + S.zip.list.length + tr('models_which_one_to') +
      S.zip.list.map((x, i) => '<button type="button" class="wsl-chip" data-zip="' + i + '">' + esc(x.name) + ' <small>' + n1(x.data.length / 1048576) + 'MB</small></button>').join('') + '</div>'
  } else if (st === 'set' && p) {
    const procs = processList(), ams = ((p.temps && p.temps.ams) || []).filter((a) => a.slot), bb = (p.send_kind || 'bambu') === 'bambu'
    h += '<p class="wsl-emb-q">🖨️ 「' + esc(p.name) + '」 · <span class="wsl-hint">' + esc(S.printer) + '</span></p>' +
      tr('quality_layer_height') + procs.map((n) => '<button type="button" class="wsl-chip sm' + (n === S.process ? ' on' : '') + '" data-proc="' + esc(n) + '">' + esc(n.replace(/\s*@.*$/, '')) + '</button>').join('') + '</div></label>' +
      tr('filament_4') + (bb && ams.length ? tr('ams_slot') : '') + '</b>' + (P ? P.hexes : ['#c9ced6']).map((c, i) => '<div class="wsl-fil">' +
        (P && P.colored ? '<span class="wsl-mc"><i style="background:' + esc(c) + '"></i>' + (P.k > 1 ? (i + 1) + tr('color') : tr('model_color')) + '</span>' : '') + filSelect(i) +
        (bb && ams.length ? '<select data-eams="' + i + '">' + ams.map((a) => '<option value="' + a.slot + '"' + (String(a.slot) === S.ams[i] ? ' selected' : '') + '>AMS ' + a.slot + ' — ' + esc(a.type || '') + '</option>').join('') +
          ((P ? P.k : 1) === 1 ? '<option value="ext"' + (S.ams[i] === 'ext' ? ' selected' : '') + tr('external_spool_2') : '') + '</select><b class="wsl-amsdot" style="background:' + esc(((ams.find((a) => String(a.slot) === S.ams[i]) || {}).color) || '#ccc') + '"></b>' : '') + '</div>').join('') + '</div>' +
      tr('infill') + [5, 10, 15, 20, 25, 30, 40, 50, 100].map((v) => '<option value="' + v + '"' + (v === S.infill ? ' selected' : '') + '>' + v + '%</option>').join('') + '</select></label>' +
        '<label class="wsl-tg"><input type="checkbox" data-support' + (S.support ? ' checked' : '') + tr('support_input_type_checkbox') + (S.brim ? ' checked' : '') + tr('brim_2') +
      '<label class="wsl-bed"><input type="checkbox" data-ebed' + (S.bed ? ' checked' : '') + tr('bed_is_clear_nothing_2') +
      (SEND_ADMIN_ONLY ? tr('shown_to_admins_only') : '') +
      tr('pick_printer_again_button') + (S.bed ? '' : ' disabled') + tr('slice_and_send')
  } else if (st === 'work') {
    const v = S.phase === 'upload' ? S.up : S.prog
    h += '<p class="wsl-emb-q">' + (S.phase === 'upload' ? '📤 「' + esc(p ? p.name : '') + tr('sending') : tr('slicing_first_time_takes')) + '</p><div class="wsl-prog"><i style="width:' + Math.round((v || 0) * 100) + '%"></i></div>'
  } else if (st === 'sent' && S.done) {
    const D = S.done
    h += '<div class="wsl-emb-ok"><b>✅ 「' + esc(D.name) + tr('sent_3') + esc(D.message) + tr('est') + dur(D.seconds) + (D.guessed ? tr('approx') : '') + tr('filament_5') + n1(D.weight) + tr('g_the_link_app') +
      tr('go_to_printer_lounge')
  }
  root.innerHTML = h + '<p class="wsl-status" data-status hidden></p></div>'
  const th = root.querySelector('[data-thumb]'); if (th && S.thumb) { S.thumb.className = 'wsl-cv'; th.appendChild(S.thumb) }
}
function stateTxt(x) { return ({ printing: tr('printing'), paused: tr('paused'), idle: tr('idle_ready'), done: tr('idle_ready'), failed: tr('idle_ready') })[x.state] || tr('ready') }
function offWhy(x) { return x.can_send ? '' : x.state === 'printing' ? tr('printing_can_t_send') : tr('link_app_silent_for') }

/* ───────── 0.1.4 다른 화면에서 넘겨받은 파일 (/slicer?handoff=열쇠) ───────── */
async function handoff() {
  let key = ''
  try { key = new URLSearchParams(location.search).get('handoff') || '' } catch (e) {}
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(key)) return
  S.msg = tr('waiting_for_the_file'); draw()
  for (let i = 0; i < 180; i++) {
    let v = null
    try { v = await takeHandoff(key) } catch (e) { break }
    if (v) {
      S.msg = ''
      try { history.replaceState(history.state, '', location.pathname) } catch (e) {}
      if (v.error || !v.blob) { S.err = v.error || tr('could_not_receive_the'); draw(); return }
      await openFile(new File([v.blob], v.name || 'model.stl', { type: v.blob.type || '' }))
      return
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  S.msg = ''; S.err = tr('the_file_did_not_2'); draw()
}
window.__wslApp = { tick: mount, version: V }
mount()
