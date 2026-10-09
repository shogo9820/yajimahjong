// ==========================================
// 🚨 ファイルの最上部（1行目）からここを貼り付けてください
// ==========================================

// PWA用のService Workerをブラウザに登録する処理
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => console.log("PWA Service Worker 登録成功!", reg))
      .catch((err) => console.log("PWA Service Worker 登録失敗...", err));
  });
}

const windLabels = ["東", "南", "西", "北"];

// アプリ内部のすべての状態データを一元管理（ルーム主導・エラー防止完全版）
let appState = {
  rooms: {
    "デフォルトルーム": {
      roomName: "デフォルトルーム",
      gameCount: 0,
      nextPlayerId: 1,
      players: {},
      playerGames: {}
    }
  },
  currentRoomName: "デフォルトルーム",
  allPlayers: [],    // 今回の対局メンバー（現在のルーム内のプレイヤーID配列）
  activePlayers: [], // 東南西北
  subPlayer: null,
  currentPoints: {},
  tableSize: 4,
  currentWind: 0,
  currentKyoku: 1,
  honbaCount: 0,
  kyotakuCount: 0,
  riichiPlayers: [],
  currentScreen: "screen-register",
  
  // 過去データ互換用のダミー（エラー防止）
  stats: {},
  gameCount: 0
};

let matchCalcState = {
  winners: [], // IDで管理
  loser: null,  // IDで管理
  type: "ron",
  scale: null,
};

let draggedElement = null;
let touchOffsetLeft = 0;
let touchOffsetTop = 0;

// 横持ち卓の4席ID（手前・右・奥・左）
const LANDSCAPE_SEAT_IDS = [
  "ls-seat-bottom", // 手前 (Seat 0)
  "ls-seat-right",  // 右 (Seat 1)
  "ls-seat-top",    // 奥 (Seat 2)
  "ls-seat-left"    // 左 (Seat 3)
];

// データをローカルストレージに自動保存する関数
function saveToLocalStorage() {
  localStorage.setItem("mj_manager_state", JSON.stringify(appState));
}

// プレイヤーIDから名前を安全に取得するヘルパー関数
function getPlayerName(id) {
  if (appState.playerMaster[id]) {
    return appState.playerMaster[id].name;
  }
  return "未知のプレイヤー";
}

// アプリ起動時の初期処理
window.onload = function () {
  const savedData = localStorage.getItem("mj_manager_state");
  if (savedData) {
    try {
      appState = JSON.parse(savedData);

      // 構造の初期化フォールバック
      if (!appState.playerMaster) appState.playerMaster = {};
      if (!appState.rooms) appState.rooms = {};
      if (!appState.nextPlayerId) appState.nextPlayerId = 1001;
      if (!appState.currentRoomName) appState.currentRoomName = "デフォルトルーム";

      // 1. メンバー一覧入力枠の復元
      const memberSelect = document.getElementById("member-count-select");
      if (memberSelect) {
        memberSelect.value = appState.allPlayers.length || 4;
      }
      updatePlayerInputs();
      
      // 2. ルーム選択肢の更新
      updateRoomSelectOptions();

      // 3. 状態に合わせて画面の見た目を復元
      setupDragAndDrop();
      updateUIKyokuDisplay();
      refreshMatchPlayerList();

      // 4. 前回閉じた画面へダイレクトジャンプ
      document
        .querySelectorAll(".screen")
        .forEach((s) => s.classList.add("hidden"));
      const targetScreen = document.getElementById(appState.currentScreen);
      if (targetScreen) targetScreen.classList.remove("hidden");

      console.log("前回のデータをLocalStorageから自動復元しました！");
      return;
    } catch (e) {
      console.error("データ復元エラー。初期画面で起動します。", e);
    }
  }
  updatePlayerInputs();
};

// メンバー登録画面の入力行を生成する関数（❌ボタン撤去完全版）
function updatePlayerInputs() {
  const container = document.getElementById("player-inputs-container");
  if (!container) return;

  const room = appState.rooms[appState.currentRoomName] || { players: {} };
  const pIds = Object.keys(room.players);
  
  const countSelect = document.getElementById("member-count-select");
  let count = countSelect ? parseInt(countSelect.value) : 4;
  if (pIds.length > count) {
    count = pIds.length;
    if (countSelect) countSelect.value = count;
  }

  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const pId = pIds[i] || "";
    const pName = pId ? room.players[pId].name : "";
    const displayId = pId ? pId : (i + 1);

    const div = document.createElement("div");
    div.className = "input-row";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "8px";
    div.style.marginBottom = "8px";

    // 🚨 ボタンをなくし、IDと名前入力欄だけのすっきりした見た目に修正
    div.innerHTML = `
      <span class="no-badge" style="min-width:65px; text-align:center;">ID: ${displayId}</span>
      <input type="text" id="p-input-${i}" data-player-id="${pId}" placeholder="プレイヤー名を入力" value="${pName}" class="form-input" style="flex:1;">
    `;
    container.appendChild(div);
  }
}

// IDからプレイヤー名を引く関数のルーム完全紐づけ化
function getPlayerName(id) {
  const room = appState.rooms[appState.currentRoomName];
  if (room && room.players[id]) {
    return room.players[id].name;
  }
  return "未知のメンツ";
}

// ルール画面のルーム選択フィールドの選択肢を更新
function updateRoomSelectOptions() {
  const roomSelect = document.getElementById("room-select");
  if (!roomSelect) return;
  roomSelect.innerHTML = "";
  
  // デフォルトルームがなければ作成
  if (!appState.rooms["デフォルトルーム"]) {
    appState.rooms["デフォルトルーム"] = { roomName: "デフォルトルーム", gameCount: 0, stats: {} };
  }

  Object.keys(appState.rooms).forEach(rName => {
    const opt = document.createElement("option");
    opt.value = rName;
    opt.innerText = rName;
    if (rName === appState.currentRoomName) {
      opt.selected = true;
    }
    roomSelect.appendChild(opt);
  });
}

// 🚨 現在選択しているルームを成績・メンバーごと丸ごと削除する機能
function deleteCurrentRoom() {
  const rName = appState.currentRoomName;
  if (rName === "デフォルトルーム") {
    alert("「デフォルトルーム」は削除できません。自分で作成したルームを削除してください。");
    return;
  }

  if (confirm(`本当にルーム「${rName}」を削除しますか？\nこのグループに保存されているメンバーの名前、これまでの全成績が完全に消去されます。`)) {
    // データを完全に消去
    delete appState.rooms[rName];
    
    // 削除後は「デフォルトルーム」に自動で引き戻す
    appState.currentRoomName = "デフォルトルーム";
    
    // セレクトボックスの選択肢とプレイヤー入力欄をリフレッシュ
    updateRoomSelectOptions();
    updatePlayerInputs();
    saveToLocalStorage();
    
    alert(`ルーム「${rName}」を削除しました。`);
  }
}

function onRoomSelectChange() {
  const roomSelect = document.getElementById("room-select");
  if (roomSelect) {
    appState.currentRoomName = roomSelect.value;
    saveToLocalStorage();
  }
}

// プレイヤー名の一括確定処理（ルーム未作成時の自動作成・エラー防止機能付き）
function submitRegistration() {
  const countSelect = document.getElementById("member-count-select");
  if (!countSelect) return;
  const count = parseInt(countSelect.value);
  
  // 🚨【重要】現在選択・入力されているルーム名がroomsに存在しない場合、ここで強制的に初期箱を作成する
  if (!appState.currentRoomName) {
    appState.currentRoomName = "デフォルトルーム";
  }
  
  if (!appState.rooms[appState.currentRoomName]) {
    appState.rooms[appState.currentRoomName] = {
      roomName: appState.currentRoomName,
      gameCount: 0,
      nextPlayerId: 1,
      players: {},
      playerGames: {}
    };
  }

  const room = appState.rooms[appState.currentRoomName];
  appState.allPlayers = [];

  for (let i = 0; i < count; i++) {
    const input = document.getElementById(`p-input-${i}`);
    const val = input ? input.value.trim() : "";
    if (!val) continue;

    let pId = input.getAttribute("data-player-id");
    
    // まだIDがない新規登録プレイヤーの場合
    if (!pId) {
      pId = room.nextPlayerId;
      room.players[pId] = { id: pId, name: val, totalGames: 0, points: 0 };
      room.nextPlayerId++;
    } else {
      // 既存プレイヤーなら名前を最新状態に更新
      room.players[pId].name = val;
    }
    appState.allPlayers.push(parseInt(pId));
  }

  if (appState.allPlayers.length < 3) {
    alert("対局には最低3人以上のメンバーが必要です");
    return;
  }

  // 最新状態にUIを同期して画面移動
  updateRoomSelectOptions();
  setupDragAndDrop();
  switchScreen("screen-register", "screen-rules");
}

function onGameModeChange() {
  setupDragAndDrop();
}

function toggleAccordion() {
  const content = document.getElementById("accordion-content");
  const icon = document.getElementById("accordion-icon");
  if (!content) return;
  if (content.classList.contains("hidden-accordion")) {
    content.classList.remove("hidden-accordion");
    if (icon) icon.classList.add("open");
  } else {
    content.classList.add("hidden-accordion");
    if (icon) icon.classList.remove("open");
  }
}

// 席決めドラッグ＆ドロップ画面の描画（IDベース）
function setupDragAndDrop() {
  const modeSelect = document.getElementById("game-mode-select");
  if (!modeSelect) return;
  const modeVal = modeSelect.value;
  const renderSeatsCount = modeVal === "4-3打ち" ? 4 : parseInt(modeVal);
  appState.tableSize = modeVal === "4-3打ち" ? 3 : parseInt(modeVal);

  const pool = document.getElementById("pool-container");
  const seats = document.getElementById("seats-container");
  if (!pool || !seats) return;

  pool.innerHTML = "";
  seats.innerHTML = "";

  appState.allPlayers.forEach((pId) => {
    const chip = document.createElement("div");
    chip.className = "player-chip";
    chip.innerText = getPlayerName(pId);
    chip.setAttribute("draggable", "true");
    chip.setAttribute("data-player-id", pId);
    chip.id = `chip-${pId}`;

    chip.addEventListener("dragstart", handleDragStart);
    chip.addEventListener("dragend", handleDragEnd);
    chip.addEventListener("touchstart", handleTouchStart, { passive: false });
    chip.addEventListener("touchmove", handleTouchMove, { passive: false });
    chip.addEventListener("touchend", handleTouchEnd);
    pool.appendChild(chip);
  });

  for (let i = 0; i < renderSeatsCount; i++) {
    const seat = document.createElement("div");
    seat.className = "seat-box";
    seat.id = `seat-${i}`;
    seat.addEventListener("dragover", handleDragOver);
    seat.addEventListener("dragleave", handleDragLeave);
    seat.addEventListener("drop", handleDrop);

    const label = (modeVal === "4-3打ち" && i === 3) ? "控（抜け番）" : `${windLabels[i]}家 席`;
    seat.innerHTML = `<span class="seat-label active-wind">${label}</span>`;
    seats.appendChild(seat);
  }
}
function handleDragStart(e) {
  draggedElement = this;
  this.style.opacity = "0.4";
}

function handleDragEnd(e) {
  this.style.opacity = "1";
  document.querySelectorAll(".seat-box, .role-box").forEach((s) => s.classList.remove("drag-over"));
}

function handleDragOver(e) {
  e.preventDefault();
  this.classList.add("drag-over");
}

function handleDragLeave() {
  this.classList.remove("drag-over");
}

function handleDrop(e) {
  e.preventDefault();
  this.classList.remove("drag-over");
  if (!draggedElement) return;
  const existingChip = this.querySelector(".player-chip");
  if (existingChip) {
    const pool = document.getElementById("pool-container");
    if (pool) pool.appendChild(existingChip);
  }
  this.appendChild(draggedElement);
}

function handleTouchStart(e) {
  draggedElement = this;
  const touch = e.touches[0];
  const rect = this.getBoundingClientRect();
  
  // 🚨 画面上の絶対位置から指のズレ（オフセット）を正確に計算（回転要素の影響を遮断）
  touchOffsetLeft = touch.clientX - rect.left;
  touchOffsetTop = touch.clientY - rect.top;

  this.style.position = "fixed";
  this.style.zIndex = "1000";
  this.style.width = `${rect.width}px`;
  
  // 🚨 横持ちの席（transformによる回転）から隔離するため、一時的に回転を打ち消す
  this.style.transform = "none"; 
  
  moveAt(touch.clientX, touch.clientY);
}

function handleTouchMove(e) {
  if (!draggedElement) return;
  e.preventDefault(); // スクロールを防止
  const touch = e.touches[0];
  moveAt(touch.clientX, touch.clientY);

  // 指の直下にある要素を正確に検知
  const elementTarget = document.elementFromPoint(touch.clientX, touch.clientY);
  document.querySelectorAll(".seat-box, .role-box, .winner-target, .loser-target").forEach((s) => s.classList.remove("drag-over"));

  if (elementTarget) {
    const targetBox = elementTarget.closest(".seat-box, .winner-target, .loser-target");
    if (targetBox) targetBox.classList.add("drag-over");
  }
}

function moveAt(clientX, clientY) {
  if (!draggedElement) return;
  draggedElement.style.left = `${clientX - touchOffsetLeft}px`;
  draggedElement.style.top = `${clientY - touchOffsetTop}px`;
}

function handleTouchEnd(e) {
  if (!draggedElement) return;
  draggedElement.style.position = "";
  draggedElement.style.zIndex = "";
  draggedElement.style.left = "";
  draggedElement.style.top = "";
  draggedElement.style.width = "";

  const changedTouch = e.changedTouches[0];
  const elementTarget = document.elementFromPoint(changedTouch.clientX, changedTouch.clientY);
  const pool = document.getElementById("pool-container");

  if (elementTarget && pool) {
    const seatBox = elementTarget.closest(".seat-box");
    if (seatBox) {
      const existingChip = seatBox.querySelector(".player-chip");
      if (existingChip) pool.appendChild(existingChip);
      seatBox.appendChild(draggedElement);
    } else {
      pool.appendChild(draggedElement);
    }
  } else if (pool) {
    pool.appendChild(draggedElement);
  }
  document.querySelectorAll(".seat-box").forEach((s) => s.classList.remove("drag-over"));
  draggedElement = null;
}

// 対局開始処理（ID不一致によるフリーズを修正した完全版）
function startMatch() {
  // ルーム名設定の取得
  const newRoomInput = document.getElementById("new-room-input");
  if (newRoomInput && newRoomInput.value.trim() !== "") {
    appState.currentRoomName = newRoomInput.value.trim();
    newRoomInput.value = ""; // 入力欄をクリア
  }
  
  // 選択されたルームが未作成なら初期化
  if (!appState.rooms[appState.currentRoomName]) {
    appState.rooms[appState.currentRoomName] = { 
      roomName: appState.currentRoomName, 
      gameCount: 0, 
      stats: {},
      playerGames: {} // 各個人のこのルームでの打数を記録する場所
    };
  }
  if (!appState.rooms[appState.currentRoomName].playerGames) {
    appState.rooms[appState.currentRoomName].playerGames = {};
  }

  appState.activePlayers = [];
  
  // 🚨【バグ修正箇所】HTML側のルール設定にある麻雀種別（卓の人数）セレクトボックスの正しいID（またはフォールバック）を適用
  const modeSelect = document.getElementById("game-mode-select") || document.getElementById("member-count-select");
  if (!modeSelect) {
    alert("設定読み込みエラー：ゲームモード選択欄が見つかりません。");
    return;
  }
  const modeVal = modeSelect.value;

  if (modeVal === "4-3打ち" || modeVal === "4-3") {
    appState.tableSize = 3;
    for (let i = 0; i < 3; i++) {
      const seatBox = document.getElementById(`seat-${i}`);
      const chip = seatBox ? seatBox.querySelector(".player-chip") : null;
      if (!chip) {
        alert(`${windLabels[i]}家の席にプレイヤーを配置してください。`);
        return;
      }
      appState.activePlayers.push(parseInt(chip.getAttribute("data-player-id")));
    }
    const seatBox3 = document.getElementById("seat-3");
    const chip3 = seatBox3 ? seatBox3.querySelector(".player-chip") : null;
    if (!chip3) {
      alert("控えの席に4人目のプレイヤーを配置してください。");
      return;
    }
    appState.subPlayer = parseInt(chip3.getAttribute("data-player-id"));
  } else {
    appState.tableSize = parseInt(modeVal) || 4;
    appState.subPlayer = null;
    for (let i = 0; i < appState.tableSize; i++) {
      const seatBox = document.getElementById(`seat-${i}`);
      const chip = seatBox ? seatBox.querySelector(".player-chip") : null;
      if (!chip) {
        alert(`${windLabels[i]}家の席にプレイヤーを配置してください。`);
        return;
      }
      appState.activePlayers.push(parseInt(chip.getAttribute("data-player-id")));
    }
  }

  appState.currentWind = 0;
  appState.currentKyoku = 1;
  appState.honbaCount = 0;
  appState.kyotakuCount = 0;
  appState.riichiPlayers = [];
  
  // 初期持ち点の割り当て
  appState.activePlayers.forEach((pId) => (appState.currentPoints[pId] = 25000));
  if (appState.subPlayer) appState.currentPoints[appState.subPlayer] = 25000;

  // 各種UIの更新と画面遷移
  updateUIKyokuDisplay();
  refreshMatchPlayerList();
  clearRoleSlots();
  switchScreen("screen-rules", "screen-match");
}

function updateUIKyokuDisplay() {
  const roundStr = (appState.currentWind === 0 ? "東" : "南") + appState.currentKyoku + "局";
  const oyaWind = appState.currentWind === 0 ? "東" : "南";
  const honbaStr = `${appState.honbaCount} 本場`;
  const kyotakuStr = `供託 ${appState.kyotakuCount}本`;

  // 1. 🀄 局数（東南の文字）のディスプレイIDを並べて書き換え
  ["current-wind-label", "ls-wind-label"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = oyaWind;
  });

  // 🚨 局数の数字（1局など）のディスプレイIDを並べて書き換え
  ["current-kyoku-num", "ls-kyoku-num"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = appState.currentKyoku;
  });


  // 2. 🀄 本場表示のディスプレイIDを並べて書き換え
  // 縦画面（current-honba）と、横画面ヘッダー（ls-honba）を一気に更新
  ["current-honba", "ls-honba"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      // 横画面のヘッダーバッジ用に綺麗に「〇本場」の形式で流し込みます
      el.innerText = (id === "ls-honba") ? `${appState.honbaCount}本場` : honbaStr;
    }
  });


  // 3. 🀄 供託表示のディスプレイIDを並べて書き換え
  // 縦画面（current-kyotaku）と、横画面ヘッダー（ls-kyotaku）を一気に更新
  ["current-kyotaku", "ls-kyotaku"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = kyotakuStr;
  });


  // 4. 🎯【今回のバグ修正の核心】横画面の卓の真ん中（中央ハブ）をピンポイント更新
  // 教えていただいた本物のID「ls-center-round」と「ls-center-honba」をここで直接書き換えます！
  const hubRound = document.getElementById("ls-center-round");
  const hubHonba = document.getElementById("ls-center-honba");
  
  if (hubRound) {
    hubRound.innerText = roundStr; // 例：「東1局」
  }
  if (hubHonba) {
    // 卓の真ん中でパッと見て一番わかりやすい「〇本場 / 供託〇本」の合体形式で美しく表示します
    hubHonba.innerText = `${appState.honbaCount}本場 / 供託${appState.kyotakuCount}本`;
  }
}

// 対局画面の更新（立直棒のHTML生成＆4人3打ち完全対応版）
function refreshMatchPlayerList() {
  const modeSelect = document.getElementById("game-mode-select");
  const modeVal = modeSelect ? modeSelect.value : "4";
  const isSanma = appState.tableSize === 3;

  // 1. 📱 縦持ち用リスト
  const listContainer = document.getElementById("match-players-list");
  if (listContainer) {
    listContainer.innerHTML = "";
    for (let i = 0; i < appState.tableSize; i++) {
      const pId = appState.activePlayers[i];
      const wind = windLabels[i];
      if (appState.currentPoints[pId] === undefined) appState.currentPoints[pId] = 25000;

      // 縦画面でも立直しているのが分かるように、立直中の場合は「is-riichi」クラスを付与
      const isRiichi = appState.riichiPlayers.includes(pId);
      const riichiClass = isRiichi ? "is-riichi" : "";

      const div = document.createElement("div");
      div.className = `match-row ${riichiClass}`;
      div.id = `match-row-${pId}`;
      div.innerHTML = `
        <div class="flex items-center gap-1">
          <span class="wind-badge">${wind}</span>
          <button onclick="declareRiichi('${pId}')" class="btn-riichi" ${isRiichi ? 'disabled' : ''}>立直</button>
          <div class="match-player-chip" id="m-chip-${pId}" data-player-id="${pId}" draggable="true">${getPlayerName(pId)}</div>
        </div>
        <input type="number" id="match-pt-${pId}" value="${appState.currentPoints[pId]}" step="100" class="input-score" onchange="syncManualScore('${pId}', this.value)">
      `;

      const chip = div.querySelector(".match-player-chip");
      bindChipEvents(chip);
      listContainer.appendChild(div);
    }
  }

  // 2. 💻 横持ち用卓
  const oyaOffset = (appState.currentKyoku - 1) % 4;

  LANDSCAPE_SEAT_IDS.forEach((seatId, physicalIndex) => {
    const seatEl = document.getElementById(seatId);
    if (!seatEl) return;

    // 純粋な3人打ち（サンマ）で左の席を使わない場合
    if (isSanma && modeVal !== "4-3打ち" && physicalIndex === 3) {
      seatEl.className = "table-seat seat-left seat-vacant";
      seatEl.innerHTML = `
        <div class="seat-header-row justify-center py-2"><span class="vacant-badge" style="font-size:11px;color:#94a3b8;">不使用</span></div>
        <div class="seat-score-row"><span class="seat-score-text" style="color:#475569;font-size:18px !important;">---</span></div>
        <!-- バグ防止用に非表示の棒を置いておく -->
        <div class="riichi-stick hidden" style="position: absolute; width: 60px; height: 6px; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 3px; box-shadow: 0 0 4px rgba(255,255,255,0.5);"></div>
      `;
      return;
    }

    let pId = appState.activePlayers[physicalIndex];

    // 🚨【4人3打ち対応】左の席が「控え（お休み）」プレイヤーの場合
    if (modeVal === "4-3打ち" && physicalIndex === 3) {
      pId = appState.subPlayer;
      const subScore = appState.currentPoints[pId] !== undefined ? appState.currentPoints[pId] : 25000;
      seatEl.className = "table-seat seat-left seat-vacant";
      seatEl.innerHTML = `
        <div class="seat-header-row" style="justify-content:space-between;width:100%;">
          <span class="vacant-badge" style="font-size:10px;background:#334155;padding:2px 4px;border-radius:4px;">控</span>
          <span class="match-player-chip" style="font-size:12px;background:transparent;border:none;max-width:100px;text-overflow:ellipsis;overflow:hidden;">${getPlayerName(pId)}</span>
        </div>
        <div class="seat-score-row"><span class="seat-score-text" style="color:#64748b;font-size:20px !important;">${subScore.toLocaleString()}</span></div>
        <!-- 交代して復帰した時のために、控え席にもあらかじめ立直棒のHTML要素を仕込んでおく -->
        <div class="riichi-stick hidden" style="position: absolute; width: 60px; height: 6px; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 3px; box-shadow: 0 0 4px rgba(255,255,255,0.5);"></div>
      `;
      return;
    }

    // 通常の対局席の描画
    seatEl.classList.remove("seat-vacant");
    const windIndex = (physicalIndex - oyaOffset + 4) % 4;
    const currentWind = windLabels[windIndex];
    const isOya = currentWind === "東";
    const pScore = appState.currentPoints[pId] !== undefined ? appState.currentPoints[pId] : 25000;

    seatEl.innerHTML = `
      <div class="seat-header-row">
        <div class="flex items-center gap-1">
          <span class="wind-badge-sm ${isOya ? 'bg-amber-500 text-black font-black' : ''}" style="width:24px;height:24px;font-size:12px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:#1e293b;color:#34d399;font-weight:bold;border:1px solid #475569;">${currentWind}</span>
          <button onclick="declareRiichi('${pId}')" class="btn-riichi" style="padding:2px 6px;font-size:10px;margin-left:4px;">立直</button>
        </div>
        <div class="match-player-chip" id="ls-chip-${pId}" data-player-id="${pId}" draggable="true" style="font-size:12px;padding:2px 6px;">${getPlayerName(pId)}</div>
      </div>
      <div class="seat-score-row"><span class="seat-score-text">${pScore.toLocaleString()}</span></div>
      
      <!-- 🚨 卓上の立直棒HTML要素 -->
      <div class="riichi-stick hidden" style="position: absolute; width: 60px; height: 6px; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 3px; box-shadow: 0 0 4px rgba(255,255,255,0.5);"></div>
    `;

    const chip = seatEl.querySelector(".match-player-chip");
    bindChipEvents(chip);

    // 立直棒の表示・非表示リアルタイム制御
    const stick = seatEl.querySelector(".riichi-stick");
    if (stick) {
      if (appState.riichiPlayers.includes(pId)) {
        stick.classList.remove("hidden");
      } else {
        stick.classList.add("hidden");
      }
    }
  });
}

function bindChipEvents(chip) {
  if (!chip) return;
  chip.addEventListener("dragstart", handleDragStart);
  chip.addEventListener("dragend", handleDragEnd);
  chip.addEventListener("touchstart", handleTouchStart, { passive: false });
  chip.addEventListener("touchmove", handleTouchMove, { passive: false });
  chip.addEventListener("touchend", handleMatchTouchEnd);
}

function syncManualScore(pId, value) {
  appState.currentPoints[pId] = parseInt(value) || 0;
  saveToLocalStorage();
  updateUIKyokuDisplay();
  
  LANDSCAPE_SEAT_IDS.forEach((seatId, idx) => {
    const seatEl = document.getElementById(seatId);
    if (!seatEl) return;
    if (appState.activePlayers[idx] == pId || (idx === 3 && appState.subPlayer == pId)) {
      const scoreTxt = seatEl.querySelector(".seat-score-text");
      if (scoreTxt) scoreTxt.innerText = (parseInt(value) || 0).toLocaleString();
    }
  });
}

function handleRoleDrop(e) {
  e.preventDefault();
  this.classList.remove("drag-over");
  if (!draggedElement) return;
  const slot = this.querySelector(".role-slot");
  if (!slot) return;
  
  const pId = parseInt(draggedElement.getAttribute("data-player-id"));
  const name = getPlayerName(pId);

  if (this.classList.contains("winner-target")) {
    if (matchCalcState.type === "tenpai") {
      if (!matchCalcState.winners.includes(pId)) {
        if (matchCalcState.winners.length === 0) slot.innerHTML = "";
        matchCalcState.winners.push(pId);
        appendChipToSlot(slot, name, pId);
      }
    } else {
      matchCalcState.winners = [pId];
      slot.innerHTML = "";
      appendChipToSlot(slot, name, pId);
    }
  } else {
    if (matchCalcState.type === "tenpai") return;
    matchCalcState.loser = pId;
    slot.innerHTML = "";
    appendChipToSlot(slot, name, pId);
  }
}

function appendChipToSlot(slot, name, pId) {
  const chipDiv = document.createElement("div");
  chipDiv.className = "match-player-chip";
  chipDiv.style.margin = "2px";
  chipDiv.innerText = name;
  chipDiv.setAttribute("data-player-id", pId);
  slot.appendChild(chipDiv);
}

function handleMatchTouchEnd(e) {
  if (!draggedElement) return;
  
  // チップに一時的に付与していた fixed や transform の設定をきれいにリセット
  draggedElement.style.position = "";
  draggedElement.style.zIndex = "";
  draggedElement.style.left = "";
  draggedElement.style.top = "";
  draggedElement.style.width = "";
  draggedElement.style.transform = "";

  const changedTouch = e.changedTouches[0];
  const targetEl = document.elementFromPoint(changedTouch.clientX, changedTouch.clientY);
  const pId = parseInt(draggedElement.getAttribute("data-player-id"));
  const name = getPlayerName(pId);

  if (targetEl) {
    // 🚨 縦画面・横画面どちらの「winner-target」「loser-target」クラスのドロップ枠でも検知できるように統一
    const winnerBox = targetEl.closest(".winner-target");
    const loserBox = targetEl.closest(".loser-target");
    
    if (winnerBox) {
      const slot = winnerBox.querySelector(".role-slot");
      if (slot) {
        if (matchCalcState.type === "tenpai") {
          if (!matchCalcState.winners.includes(pId)) {
            if (matchCalcState.winners.length === 0) slot.innerHTML = "";
            matchCalcState.winners.push(pId);
            appendChipToSlot(slot, name, pId);
          }
        } else {
          matchCalcState.winners = [pId];
          slot.innerHTML = "";
          appendChipToSlot(slot, name, pId);
        }
      }
    } else if (loserBox && matchCalcState.type !== "tenpai") {
      const slot = loserBox.querySelector(".role-slot");
      if (slot) {
        matchCalcState.loser = pId;
        slot.innerHTML = "";
        appendChipToSlot(slot, name, pId);
      }
    }
  }
  document.querySelectorAll(".role-box, .winner-target, .loser-target").forEach((b) => b.classList.remove("drag-over"));
  draggedElement = null;
}

function setAgariType(type) {
  matchCalcState.type = type;

  ["btn-agari-ron", "ls-btn-agari-ron"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", type === "ron");
  });
  ["btn-agari-tsumo", "ls-btn-agari-tsumo"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", type === "tsumo");
  });
  ["btn-agari-tenpai", "ls-btn-agari-tenpai"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active-tenpai", type === "tenpai");
  });

  clearRoleSlotsOnly();

  const isTenpai = (type === "tenpai");
  const isTsumo = (type === "tsumo");

  const winnerTexts = isTenpai ? "⭕ 聴牌者 (それ以外はノーテン)" : "🏆 和了者 (アガリ)";
  const loserTexts  = isTenpai ? "❌ （聴牌時は不使用）" : "🎯 放銃者 (ロンの場合)";

  ["role-winner-label", "ls-role-winner-label"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = winnerTexts;
  });
  ["role-loser-label", "ls-role-loser-label"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = loserTexts;
  });

  ["role-loser-box", "ls-role-loser-box"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.opacity = isTenpai ? "0.2" : (isTsumo ? "0.3" : "1");
  });

  ["panel-scale-box", "ls-panel-scale-box", "panel-detail-box", "ls-panel-detail-box"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (isTenpai) el.classList.add("hidden");
      else el.classList.remove("hidden");
    }
  });
}

function selectManganScale(scale) {
  document.querySelectorAll(".btn-scale").forEach((b) => b.classList.remove("active"));
  if (matchCalcState.scale === scale) {
    matchCalcState.scale = null;
  } else {
    matchCalcState.scale = scale;
    if (event && event.target) {
      event.target.classList.add("active");
    }
  }
}

function clearRoleSlotsOnly() {
  const sWinner = document.getElementById("slot-winner");
  const sLoser = document.getElementById("slot-loser");
  const lsWinner = document.getElementById("ls-slot-winner");
  const lsLoser = document.getElementById("ls-slot-loser");

  if (sWinner) sWinner.innerText = "ここにプレイヤーをドロップ";
  if (sLoser) sLoser.innerText = "ここにプレイヤーをドロップ";
  if (lsWinner) lsWinner.innerText = "ここにプレイヤーをドロップ";
  if (lsLoser) lsLoser.innerText = "ここにプレイヤーをドロップ";

  matchCalcState.winners = [];
  matchCalcState.loser = null;
  matchCalcState.scale = null;
  document.querySelectorAll(".btn-scale").forEach((b) => b.classList.remove("active"));
}

function clearRoleSlots() {
  clearRoleSlotsOnly();
  setAgariType("ron");
}

function executePointTransfer() {
  if (matchCalcState.type !== "tenpai" && matchCalcState.winners.length === 0) {
    alert("和了者(アガリ)を設定してください");
    return;
  }
  if (matchCalcState.type === "ron" && !matchCalcState.loser) {
    alert("ロンの場合は放銃者を設定してください");
    return;
  }

  const currentOyaId = appState.activePlayers[0];
  let isRenchan = false;

  if (matchCalcState.type === "tenpai") {
    const tenpaiCount = matchCalcState.winners.length;
    const allActive = appState.activePlayers;
    const noTenCount = allActive.length - tenpaiCount;

    if (tenpaiCount > 0 && noTenCount > 0) {
      let plusScore = 0;
      let minusScore = 0;
      if (tenpaiCount === 1) { plusScore = 3000; minusScore = 3000 / noTenCount; }
      if (tenpaiCount === 2) { plusScore = 1500; minusScore = 1500; }
      if (tenpaiCount === 3) { plusScore = 1000; minusScore = 3000; }

      allActive.forEach((pId) => {
        if (matchCalcState.winners.includes(pId)) {
          appState.currentPoints[pId] += plusScore;
        } else {
          appState.currentPoints[pId] -= minusScore;
        }
      });
    }
    if (matchCalcState.winners.includes(currentOyaId)) {
      isRenchan = true;
    }
    appState.honbaCount += 1;
    alert(`流局精算を完了しました（テンパイ: ${tenpaiCount}人）`);
  } else {
    const winnerId = matchCalcState.winners[0];
    const isWinnerOya = currentOyaId === winnerId;
    let pointsWinnerGets = 0;
    let pointsOyaPays = 0;
    let pointsKoPays = 0;

    if (matchCalcState.scale) {
      if (matchCalcState.scale === "mangan") pointsWinnerGets = isWinnerOya ? 12000 : 8000;
      if (matchCalcState.scale === "hanman") pointsWinnerGets = isWinnerOya ? 18000 : 12000;
      if (matchCalcState.scale === "baiman") pointsWinnerGets = isWinnerOya ? 24000 : 16000;
      if (matchCalcState.scale === "sanbaiman") pointsWinnerGets = isWinnerOya ? 36000 : 24000;
      if (matchCalcState.scale === "yakuman") pointsWinnerGets = isWinnerOya ? 48000 : 32000;

      if (matchCalcState.type === "tsumo") {
        if (isWinnerOya) {
          pointsKoPays = pointsWinnerGets / (appState.tableSize - 1);
        } else {
          pointsOyaPays = pointsWinnerGets / 2;
          pointsKoPays = pointsWinnerGets / 4;
        }
      }
    }
    else {
      const hanEl = document.getElementById("select-han");
      const han = hanEl ? parseInt(hanEl.value) : 1;
      if (han === 1) pointsWinnerGets = isWinnerOya ? 1500 : 1000;
      if (han === 2) pointsWinnerGets = isWinnerOya ? 2900 : 2000;
      if (han === 3) pointsWinnerGets = isWinnerOya ? 5800 : 3900;
      if (han === 4) pointsWinnerGets = isWinnerOya ? 11600 : 7700;

      if (matchCalcState.type === "tsumo") {
        if (isWinnerOya) {
          pointsKoPays = Math.ceil((pointsWinnerGets / (appState.tableSize - 1)) / 100) * 100;
        } else {
          pointsOyaPays = Math.ceil((pointsWinnerGets / 2) / 100) * 100;
          pointsKoPays = Math.ceil((pointsWinnerGets / 4) / 100) * 100;
        }
      }
    }

    const honbaValue = appState.honbaCount * 300;
    const honbaTsumoValue = appState.honbaCount * 100;

    if (matchCalcState.type === "ron") {
      appState.currentPoints[winnerId] += pointsWinnerGets + honbaValue;
      appState.currentPoints[matchCalcState.loser] -= (pointsWinnerGets + honbaValue);
    } else {
      appState.currentPoints[winnerId] += pointsWinnerGets + (appState.tableSize - 1) * honbaTsumoValue;
      appState.activePlayers.forEach((pId) => {
        if (pId === winnerId) return;
        if (currentOyaId === pId) {
          appState.currentPoints[pId] -= (pointsOyaPays + honbaTsumoValue);
        } else {
          appState.currentPoints[pId] -= (pointsKoPays + honbaTsumoValue);
        }
      });
    }

    if (appState.kyotakuCount > 0) {
      appState.currentPoints[winnerId] += appState.kyotakuCount * 1000;
      appState.kyotakuCount = 0;
    }
    
    if (isWinnerOya) {
      isRenchan = true;
      appState.honbaCount += 1;
    } else {
      isRenchan = false;
      appState.honbaCount = 0;
    }
  }

  if (isRenchan) {
    alert("親の連荘です！交代はありません。");
  } else {
    const modeSelect = document.getElementById("game-mode-select");
    const modeVal = modeSelect ? modeSelect.value : "4";
    
    if (modeVal === "4-3打ち") {
      const oldOya = appState.activePlayers.shift();
      appState.activePlayers.push(appState.subPlayer);
      appState.subPlayer = oldOya;
      appState.currentKyoku += 1;
      if (appState.currentKyoku > 3) {
        appState.currentKyoku = 1;
        appState.currentWind += 1;
      }
      alert(`親移動交代:「${getPlayerName(oldOya)}」が控えへ、お休みの「${getPlayerName(appState.activePlayers[2])}」が卓に入りました！`);
    } else {
      const shiftedPlayer = appState.activePlayers.shift();
      appState.activePlayers.push(shiftedPlayer);
      appState.currentKyoku += 1;
      const maxKyoku = appState.tableSize === 3 ? 3 : 4;
      if (appState.currentKyoku > maxKyoku) {
        appState.currentKyoku = 1;
        appState.currentWind += 1;
      }
      alert("親が流れました。");
    }
  }

  appState.riichiPlayers = [];
  updateUIKyokuDisplay();
  refreshMatchPlayerList();
  clearRoleSlots();
  saveToLocalStorage();
}

// 縦画面・横画面どちらのサイコロボタンを押してもエラーを出さずにリアルタイム同期する関数
function rollDice() {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  const sum = d1 + d2;
  
  // 画面に流し込むテキストを作成
  const resultText = `出目: ${sum} (${d1}, ${d2})`;
  
  let targetWind = "";
  if ([5, 9].includes(sum)) targetWind = "東家(自家)";
  else if ([2, 6, 10].includes(sum)) targetWind = "南家(右面)";
  else if ([3, 7, 11].includes(sum)) targetWind = "西家(対面)";
  else if ([4, 8, 12].includes(sum)) targetWind = "北家(左面)";
  
  const naviText = `${targetWind}の山、右から${sum}列残して開門`;

  // 1. 📱 縦画面用の表示枠（存在する場合のみ安全に書き換え）
  const diceRes = document.getElementById("dice-result");
  const haipaiNavi = document.getElementById("haipai-navi");
  if (diceRes) diceRes.innerText = resultText;
  if (haipaiNavi) haipaiNavi.innerText = naviText;

  // 2. 💻 横画面用の表示枠（存在する場合のみ安全に書き換え）
  // 🚨【エラー回避の核心】要素が存在するかチェック（if判定）を挟むことで、
  // 片方の画面にナビ用の枠がなくてもプログラムがクラッシュせず、出目だけを確実に描画します。
  const lsDiceRes = document.getElementById("ls-dice-result");
  const lsHaipaiNavi = document.getElementById("ls-haipai-navi");
  
  if (lsDiceRes) {
    lsDiceRes.innerText = resultText;
  }
  if (lsHaipaiNavi) {
    lsHaipaiNavi.innerText = naviText;
  }
}

// 半荘終了時のスコア精算とルームへの独立保存処理（エラー完全修正版）
function endMatch() {
  let currentScores = [];
  for (let i = 0; i < appState.tableSize; i++) {
    const pId = appState.activePlayers[i];
    const score = appState.currentPoints[pId];
    currentScores.push({ id: pId, score: score, index: i });
  }
  currentScores.sort((a, b) => b.score - a.score || a.index - b.index);

  const baseReturn = 30000;
  const is3人 = appState.tableSize === 3;
  const umaRuleEl = document.getElementById("rule-uma");
  const umaRule = umaRuleEl ? umaRuleEl.value : "10-30";
  
  let uma = is3人 ? [10, 0, -10] : [20, 10, -10, -20];
  if (umaRule === "10-30") uma = is3人 ? [20, 0, -20] : [30, 10, -10, -30];
  if (umaRule === "10-20") uma = is3人 ? [10, 0, -10] : [20, 10, -10, -20];
  const oka = is3人 ? 15 : 20;

  let room = appState.rooms[appState.currentRoomName];
  room.gameCount++;

  let calculatedRows = [];
  currentScores.forEach((item, rank) => {
    let rawPt = (item.score - baseReturn) / 1000;
    let roundedPt = Math.round(rawPt);
    let finalPt = roundedPt + uma[rank];
    if (rank === 0) finalPt += oka;
    
    calculatedRows.push({
      rank: rank + 1,
      name: getPlayerName(item.id),
      score: item.score,
      pt: finalPt,
    });
    
    // ルーム内の該当プレイヤーデータに直接成績と対局数を加算する
    if (room.players[item.id]) {
      room.players[item.id].points += finalPt;
      room.players[item.id].totalGames++;
    }
  });

  const tbody = document.getElementById("result-table-body");
  if (tbody) {
    tbody.innerHTML = "";
    calculatedRows.forEach((row) => {
      const tr = document.createElement("tr");
      const ptClass = row.pt >= 0 ? "pt-plus" : "pt-minus";
      const ptSign = row.pt > 0 ? "+" : "";
      tr.innerHTML = `<td><strong>${row.rank}位</strong></td><td>${row.name}</td><td class="text-right font-mono">${row.score.toLocaleString()}</td><td class="text-right font-mono ${ptClass}">${ptSign}${row.pt.toFixed(1)}</td>`;
      tbody.appendChild(tr);
    });
  }
  switchScreen("screen-match", "screen-result");
}

// 累積成績表画面を開く（現在の選択ルームの順位表を安全に表示）
function openStats() {
  const tbody = document.getElementById("stats-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  const room = appState.rooms[appState.currentRoomName] || { gameCount: 0, players: {} };
  
  let sortedStats = Object.keys(room.players)
    .map((pId) => {
      const p = room.players[pId];
      return { 
        id: pId, 
        name: p.name, 
        pt: p.points,
        games: p.totalGames
      };
    })
    .sort((a, b) => b.pt - a.pt);
    
  sortedStats.forEach((item) => {
    const tr = document.createElement("tr");
    const ptClass = item.pt >= 0 ? "pt-plus" : "pt-minus";
    const ptSign = item.pt > 0 ? "+" : "";
    
    tr.innerHTML = `
      <td><strong>${item.name}</strong> <span style="font-size:10px; color:#64748b;">(ID:${item.id})</span></td>
      <td class="text-center font-mono">${item.games}</td>
      <td class="text-right font-mono ${ptClass}">${ptSign}${item.pt.toFixed(1)}</td>
    `;
    tbody.appendChild(tr);
  });
  
  const titleEl = document.querySelector("#screen-stats .title");
  if (titleEl) {
    titleEl.innerHTML = `総成績表<div class="subtitle">現在のルーム: ${appState.currentRoomName}</div>`;
  }
  
  const statsScreen = document.getElementById("screen-stats");
  if (statsScreen) statsScreen.classList.remove("hidden");
}

function closeStats() {
  const statsScreen = document.getElementById("screen-stats");
  if (statsScreen) statsScreen.classList.add("hidden");
}

function nextGame() {
  switchScreen("screen-result", "screen-rules");
}

function backToScreen(from) {
  const fromEl = document.getElementById(from);
  const regEl = document.getElementById("screen-register");
  if (fromEl) fromEl.classList.add("hidden");
  if (regEl) regEl.classList.remove("hidden");
}

function switchScreen(fromId, toId) {
  const fromEl = document.getElementById(fromId);
  const toEl = document.getElementById(toId);
  if (fromEl) fromEl.classList.add("hidden");
  if (toEl) toEl.classList.remove("hidden");
  appState.currentScreen = toId;
  saveToLocalStorage();
  window.scrollTo(0, 0);
}

function resetAllAppStorageData() {
  if (confirm("これまでの累積名簿や全ルーム成績を含むすべてのデータを完全にリセットしますか？")) {
    localStorage.removeItem("mj_manager_state");
    location.reload();
  }
}

// 🀄 立直ボタンが押されたときの処理（完全統合版：引数は pId で統一）
function declareRiichi(pId) {
  // 数値計算用に型を確実に数値に変換
  pId = parseInt(pId);

  // 1. すでに立直している場合は重複処理をしない
  if (appState.riichiPlayers.includes(pId)) {
    alert(`${getPlayerName(pId)} はすでに立直しています。`);
    return;
  }
  
  // 2. 持ち点チェック
  if (appState.currentPoints[pId] < 1000) {
    alert("持ち点が1,000点未満のため立直できません");
    return;
  }

  // 3. 内部データ計算（1000点マイナスと供託の加算）
  appState.currentPoints[pId] -= 1000;
  appState.kyotakuCount += 1;
  appState.riichiPlayers.push(pId);

  // 4. 📱 縦画面側のリストに「立直中」のクラスを付与
  const rowEl = document.getElementById(`match-row-${pId}`);
  if (rowEl) rowEl.classList.add("is-riichi");

  // 5. 💻 横画面側のあらかじめHTMLに置いてある立直棒を「表示」にする
  LANDSCAPE_SEAT_IDS.forEach((seatId, physicalIndex) => {
    // 4人3打ちの控えプレイヤーの場合は除外
    if (appState.tableSize === 3 && physicalIndex === 3 && document.getElementById("game-mode-select").value === "4-3打ち") {
      return; 
    }

    const currentPlayerId = appState.activePlayers[physicalIndex];
    if (currentPlayerId === pId) {
      const seatEl = document.getElementById(seatId);
      const stick = seatEl ? seatEl.querySelector(".riichi-stick") : null;
      if (stick) {
        stick.classList.remove("hidden"); // 最初から仕込んである赤丸付きの棒を出す
      }
    }
  });

  // 6. 🔢 点数入力フォームの数値を最新の点数（-1000点された値）に同期
  const inputScore = document.getElementById(`match-pt-${pId}`);
  if (inputScore) inputScore.value = appState.currentPoints[pId];

  // 7. 👑 上部ヘッダーの「供託・本場バッジ」をリアルタイム更新
  if (typeof updateUIKyokuDisplay === "function") {
    updateUIKyokuDisplay();
  }

  // 8. 💾 状態をローカルストレージに保存
  saveToLocalStorage();
}
