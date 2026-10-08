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

// アプリ内部のすべての状態データを一元管理（ID番号・名簿・ルーム管理対応版）
let appState = {
  rooms: {
    "デフォルトルーム": {
      roomName: "デフォルトルーム",
      gameCount: 0,
      nextPlayerId: 1, // 🚨 ルームごとに個別のIDカウンターを持つ
      players: {}      // 🚨 { 1: { id: 1, name: "佐藤", totalGames: 3, points: 45.2 } }
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
  currentScreen: "screen-register"
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

// メンバー登録画面の名簿選択＆名前入力フォームの動的生成
// メンバー登録画面のプレイヤー入力行を正しくID連番で動的生成する関数
function updatePlayerInputs() {
  const container = document.getElementById("player-inputs-container");
  if (!container) return;

  const room = appState.rooms[appState.currentRoomName] || { players: {} };
  const pIds = Object.keys(room.players);
  
  // セレクトボックスで選ばれている現在の人数を取得
  const countSelect = document.getElementById("member-count-select");
  const count = countSelect ? parseInt(countSelect.value) : 4;

  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    // 既存のルームメンバーがいる場合はそのIDを使い、足りない新規枠は自動連番にする
    const pId = pIds[i] || "";
    const pName = pId ? room.players[pId].name : "";
    
    // 表示用のID番号（既存IDがあればそれを使い、なければ新しく割り振る予定の連番を表示）
    const displayId = pId ? pId : (i + 1);

    const div = document.createElement("div");
    div.className = "input-row";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "8px";
    div.style.marginBottom = "8px";

    div.innerHTML = `
      <span class="no-badge" style="min-width:65px; text-align:center;">ID: ${displayId}</span>
      <input type="text" id="p-input-${i}" data-player-id="${pId}" placeholder="プレイヤー名を入力" value="${pName || "プレイヤー" + (i + 1)}" class="form-input" style="flex:1;">
      ${pId ? `<button onclick="deleteRoomPlayer(\${pId})" class="btn-riichi" style="background:#f43f5e; border:none; margin:0; padding:10px 14px; border-radius:12px; color:white; font-weight:bold;">❌</button>` : ""}
    `;
    container.appendChild(div);
  }
}
// 過去の登録メンバーをドロップダウンで選択した時、入力欄に名前を自動代入する処理
function onMasterSelect(index, playerId) {
  const input = document.getElementById(`p-input-${index}`);
  if (!input) return;
  if (playerId && appState.playerMaster[playerId]) {
    input.value = appState.playerMaster[playerId].name;
    // 選択されたIDを一時的にカスタム属性に退避
    input.setAttribute("data-selected-id", playerId);
  } else {
    input.removeAttribute("data-selected-id");
  }
}// ルームが選ばれたら自動的にメンバーをリロードする
function onRoomChange(rName) {
  if (!rName) return;
  appState.currentRoomName = rName;
  updatePlayerInputs();
  saveToLocalStorage();
}

// 新規ルームを作成する
function createNewRoom(rName) {
  const name = rName.trim();
  if (!name) return;
  if (!appState.rooms[name]) {
    appState.rooms[name] = { roomName: name, gameCount: 0, nextPlayerId: 1, players: {} };
  }
  appState.currentRoomName = name;
  updateRoomSelectOptions();
  updatePlayerInputs();
  document.getElementById("new-room-input").value = "";
  saveToLocalStorage();
}

// 🚨 ルームに紐づくメンバーを成績ごと完全に削除する機能
function deleteRoomPlayer(pId) {
  const room = appState.rooms[appState.currentRoomName];
  if (!room || !room.players[pId]) return;
  
  if (confirm(`「${room.players[pId].name}」のデータをこのルームから完全に削除しますか？（これまでの成績も消去されます）`)) {
    delete room.players[pId];
    updatePlayerInputs();
    saveToLocalStorage();
  }
}

// プレイヤー名の一括確定処理
function submitRegistration() {
  const count = parseInt(document.getElementById("member-count-select").value);
  const room = appState.rooms[appState.currentRoomName];
  appState.allPlayers = [];

  for (let i = 0; i < count; i++) {
    const input = document.getElementById(`p-input-${i}`);
    const val = input ? input.value.trim() : "";
    if (!val) continue;

    let pId = input.getAttribute("data-player-id");
    if (!pId) {
      pId = room.nextPlayerId;
      room.players[pId] = { id: pId, name: val, totalGames: 0, points: 0 };
      room.nextPlayerId++;
    } else {
      room.players[pId].name = val; // 名前が書き換えられたら上書き
    }
    appState.allPlayers.push(parseInt(pId));
  }

  if (appState.allPlayers.length < 3) {
    alert("対局には最低3人以上のメンバーが必要です");
    return;
  }

  setupDragAndDrop();
  switchScreen("screen-register", "screen-rules");
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

function onRoomSelectChange() {
  const roomSelect = document.getElementById("room-select");
  if (roomSelect) {
    appState.currentRoomName = roomSelect.value;
    saveToLocalStorage();
  }
}

// メンバー登録確定時の処理（ここで新規プレイヤーにIDを自動発行）
function submitRegistration() {
  const selectEl = document.getElementById("member-count-select");
  if (!selectEl) return;
  const count = parseInt(selectEl.value);
  
  appState.allPlayers = [];
  
  for (let i = 0; i < count; i++) {
    const input = document.getElementById(`p-input-${i}`);
    if (!input) return;
    const val = input.value.trim();
    if (!val) {
      alert("全員の名前を入力するか、名簿から選択してください");
      return;
    }

    let pId = input.getAttribute("data-selected-id");
    
    // 名簿から選んでいない、または名前が書き換えられている場合は新規プレイヤーとしてID発行
    if (!pId || !appState.playerMaster[pId] || appState.playerMaster[pId].name !== val) {
      pId = appState.nextPlayerId;
      appState.playerMaster[pId] = { id: pId, name: val, totalGames: 0 };
      appState.nextPlayerId++;
    }

    appState.allPlayers.push(parseInt(pId));
  }
  
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
  touchOffsetLeft = touch.clientX - rect.left;
  touchOffsetTop = touch.clientY - rect.top;

  this.style.position = "fixed";
  this.style.zIndex = "1000";
  this.style.width = `${rect.width}px`;
  moveAt(touch.clientX, touch.clientY);
}

function handleTouchMove(e) {
  if (!draggedElement) return;
  e.preventDefault();
  const touch = e.touches[0];
  moveAt(touch.clientX, touch.clientY);

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

// 対局開始処理（ルーム名の決定と各種進行状態の初期化）
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
      playerGames: {} // 🚨【新設】各個人のこのルームでの打数を記録する場所
    };
  }
  if (!appState.rooms[appState.currentRoomName].playerGames) {
    appState.rooms[appState.currentRoomName].playerGames = {};
  }

  appState.activePlayers = [];
  const modeSelect = document.getElementById("game-mode-select");
  if (!modeSelect) return;
  const modeVal = modeSelect.value;

  if (modeVal === "4-3打ち") {
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
    appState.tableSize = parseInt(modeVal);
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
  
  appState.activePlayers.forEach((pId) => (appState.currentPoints[pId] = 25000));
  if (appState.subPlayer) appState.currentPoints[appState.subPlayer] = 25000;

  updateUIKyokuDisplay();
  refreshMatchPlayerList();
  clearRoleSlots();
  switchScreen("screen-rules", "screen-match");
}

function updateUIKyokuDisplay() {
  const roundStr = (appState.currentWind === 0 ? "東" : "南") + appState.currentKyoku + "局";
  
  const wLabel = document.getElementById("current-wind-label");
  const kNum = document.getElementById("current-kyoku-num");
  const honba = document.getElementById("current-honba");
  const kyotaku = document.getElementById("current-kyotaku");
  if (wLabel) wLabel.innerText = appState.currentWind === 0 ? "東" : "南";
  if (kNum) kNum.innerText = appState.currentKyoku;
  if (honba) honba.innerText = `${appState.honbaCount} 本場`;
  if (kyotaku) kyotaku.innerText = `供託 ${appState.kyotakuCount}本`;

  const hubRound = document.getElementById("ls-hub-round");
  const hubHonba = document.getElementById("ls-hub-honba");
  if (hubRound) hubRound.innerText = roundStr;
  if (hubHonba) hubHonba.innerText = `${appState.honbaCount}本場 / 供託${appState.kyotakuCount}本`;
}

// 対局画面の更新（IDをキーにして名前を引く形式）
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

      const div = document.createElement("div");
      div.className = "match-row";
      div.id = `match-row-${pId}`;
      div.innerHTML = `
        <div class="flex items-center gap-1">
          <span class="wind-badge">${wind}</span>
          <button onclick="declareRiichi('${pId}')" class="btn-riichi">立直</button>
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

    if (isSanma && modeVal !== "4-3打ち" && physicalIndex === 3) {
      seatEl.className = "table-seat seat-left seat-vacant";
      seatEl.innerHTML = `
        <div class="seat-header-row justify-center py-2"><span class="vacant-badge" style="font-size:11px;color:#94a3b8;">不使用</span></div>
        <div class="seat-score-row"><span class="seat-score-text" style="color:#475569;font-size:18px !important;">---</span></div>
      `;
      return;
    }

    let pId = appState.activePlayers[physicalIndex];
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
      `;
      return;
    }

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
    `;

    const chip = seatEl.querySelector(".match-player-chip");
    bindChipEvents(chip);
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

function declareRiichi(pId) {
  pId = parseInt(pId);
  if (appState.riichiPlayers.includes(pId)) {
    alert(`${getPlayerName(pId)} はすでに立直しています。`);
    return;
  }
  if (appState.currentPoints[pId] < 1000) {
    alert("持ち点が1,000点未満のため立直できません");
    return;
  }

  appState.currentPoints[pId] -= 1000;
  appState.kyotakuCount += 1;
  appState.riichiPlayers.push(pId);

  updateUIKyokuDisplay();
  refreshMatchPlayerList();
  saveToLocalStorage();
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
  draggedElement.style.position = "";
  draggedElement.style.zIndex = "";
  draggedElement.style.left = "";
  draggedElement.style.top = "";
  draggedElement.style.width = "";

  const changedTouch = e.changedTouches;
  const targetEl = document.elementFromPoint(changedTouch.clientX, changedTouch.clientY);
  const pId = parseInt(draggedElement.getAttribute("data-player-id"));
  const name = getPlayerName(pId);

  if (targetEl) {
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

function rollDice() {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  const sum = d1 + d2;
  
  const diceRes = document.getElementById("dice-result");
  if (diceRes) diceRes.innerText = `出目: ${sum} (${d1}, ${d2})`;
  
  let targetWind = "";
  if ([5, 9].includes(sum)) targetWind = "東家(自家)";
  else if ([2, 6, 10].includes(sum)) targetWind = "南家(右面)";
  else if ([3, 7, 11].includes(sum)) targetWind = "西家(対面)";
  else if ([4, 8, 12].includes(sum)) targetWind = "北家(左面)";
  
  const haipaiNavi = document.getElementById("haipai-navi");
  if (haipaiNavi) haipaiNavi.innerText = `${targetWind}の山、右から${sum}列残して開門`;
}
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
  // 変更後
  room.gameCount++;
  currentScores.forEach((item, rank) => {
    let finalPt = Math.round((item.score - baseReturn) / 1000) + uma[rank];
    if (rank === 0) finalPt += oka;
    
    // ルームの中のプレイヤーデータに直接加算
    const pData = room.players[item.id];
    pData.points += finalPt;
    pData.totalGames++;
  });

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
    
    if (room.stats[item.id] === undefined) room.stats[item.id] = 0;
    room.stats[item.id] += finalPt;
    
    // 🚨 実際にこの半荘を打ったプレイヤーだけルーム内の対局数をプラスする
    if (room.playerGames[item.id] === undefined) room.playerGames[item.id] = 0;
    room.playerGames[item.id]++;
    
    appState.playerMaster[item.id].totalGames++;
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

function openStats() {
  const tbody = document.getElementById("stats-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  // 変更後
  const room = appState.rooms[appState.currentRoomName] || { gameCount: 0, players: {} };
  let sortedStats = Object.keys(room.players)
    .map((pId) => {
      const p = room.players[pId];
      return { id: pId, name: p.name, pt: p.points, games: p.totalGames };
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
