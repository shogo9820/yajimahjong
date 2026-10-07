// PWA用のService Workerをブラウザに登録する処理
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('PWA Service Worker 登録成功!', reg))
            .catch(err => console.log('PWA Service Worker 登録失敗...', err));
    });
}

const windLabels = ['東', '南', '西', '北'];

// アプリ内部のすべての状態データを一元管理
let appState = {
    allPlayers: [],    // 全員の名前リスト
    activePlayers: [], // 実際に卓についているメンバー（東南西北）
    subPlayer: null,   // 4人3打ち用の控えプレイヤー名
    currentPoints: {}, // 今回の半荘の現在の持ち点
    stats: {},         // 参加者全員の通算累積成績
    gameCount: 0,      // 総半荘数
    tableSize: 4,      // 3人麻雀なら3、4人麻雀なら4
    currentWind: 0,    // 0=東場, 1=南場
    currentKyoku: 1,   // 1局〜4局
    honbaCount: 0,     // 本場（積棒）の数
    kyotakuCount: 0,   // 供託（リーチ棒）の数
    currentScreen: 'screen-register' // 🚨現在表示中の画面IDを追跡
};

let matchCalcState = {
    winners: [], loser: null, type: 'ron', scale: null        
};

let draggedElement = null;

// 🚨 【新設】データをローカルストレージに自動保存する関数
function saveToLocalStorage() {
    localStorage.setItem('mj_manager_state', JSON.stringify(appState));
}

// アプリ起動時の初期処理（自動ロード処理を搭載）
window.onload = function() {
    const savedData = localStorage.getItem('mj_manager_state');
    if (savedData) {
        try {
            // 過去のセーブデータを読み込んで状態を完全復元
            appState = JSON.parse(savedData);
            
            // 1. メンバー一覧入力枠の復元
            document.getElementById('member-count-select').value = appState.allPlayers.length || 4;
            updatePlayerInputs();
            appState.allPlayers.forEach((name, i) => {
                const input = document.getElementById(`p-input-${i}`);
                if (input) input.value = name;
            });

            // 2. 状態に合わせて画面の見た目を復元
            setupDragAndDrop();
            updateUIKyokuDisplay();
            refreshMatchPlayerList();

            // 3. 前回閉じた画面へダイレクトジャンプ
            document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
            const targetScreen = document.getElementById(appState.currentScreen);
            if (targetScreen) targetScreen.classList.remove('hidden');
            
            console.log('前回のデータをLocalStorageから自動復元しました！');
            return;
        } catch (e) {
            console.error('データ復元エラー。初期画面で起動します。', e);
        }
    }
    updatePlayerInputs();
};

function updatePlayerInputs() {
    const count = parseInt(document.getElementById('member-count-select').value);
    const container = document.getElementById('player-inputs-container');
    const currentValues = Array.from(container.querySelectorAll('input')).map(i => i.value);

    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const div = document.createElement('div');
        div.className = 'input-row';
        div.innerHTML = `
            <span class="no-badge">No. ${i+1}</span>
            <input type="text" id="p-input-${i}" placeholder="プレイヤー名" value="${currentValues[i] || 'プレイヤー' + (i+1)}" class="form-input" onchange="saveCurrentInputNames()">
        `;
        container.appendChild(div);
    }
}

// 名前を入力するたびにリアルタイムにバックアップ
function saveCurrentInputNames() {
    const count = parseInt(document.getElementById('member-count-select').value);
    appState.allPlayers = [];
    for (let i = 0; i < count; i++) {
        const val = document.getElementById(`p-input-${i}`).value.trim();
        appState.allPlayers.push(val || 'プレイヤー' + (i+1));
    }
    saveToLocalStorage();
}

function submitRegistration() {
    const count = parseInt(document.getElementById('member-count-select').value);
    appState.allPlayers = [];
    for (let i = 0; i < count; i++) {
        const val = document.getElementById(`p-input-${i}`).value.trim();
        if (!val) { alert('全員の名前を入力してください'); return; }
        appState.allPlayers.push(val);
        if (appState.stats[val] === undefined) { appState.stats[val] = 0; }
    }
    setupDragAndDrop();
    switchScreen('screen-register', 'screen-rules');
}

function onGameModeChange() { setupDragAndDrop(); }

function toggleAccordion() {
    const content = document.getElementById('accordion-content');
    const icon = document.getElementById('accordion-icon');
    if (content.classList.contains('hidden-accordion')) {
        content.classList.remove('hidden-accordion'); icon.classList.add('open');
    } else {
        content.classList.add('hidden-accordion'); icon.classList.remove('open');
    }
}
function setupDragAndDrop() {
    const modeVal = document.getElementById('game-mode-select').value;
    const renderSeatsCount = (modeVal === '4-3打ち') ? 4 : parseInt(modeVal);
    appState.tableSize = (modeVal === '4-3打ち') ? 3 : parseInt(modeVal);
    
    const pool = document.getElementById('pool-container');
    const seats = document.getElementById('seats-container');
    pool.innerHTML = ''; seats.innerHTML = '';

    appState.allPlayers.forEach((name, index) => {
        const chip = document.createElement('div');
        chip.className = 'player-chip';
        chip.innerText = name;
        chip.setAttribute('draggable', 'true');
        chip.id = `chip-${index}`;
        
        chip.addEventListener('dragstart', handleDragStart);
        chip.addEventListener('dragend', handleDragEnd);
        chip.addEventListener('touchstart', handleTouchStart, { passive: false });
        chip.addEventListener('touchmove', handleTouchMove, { passive: false });
        chip.addEventListener('touchend', handleTouchEnd);
        pool.appendChild(chip);
    });

    for (let i = 0; i < renderSeatsCount; i++) {
        const seat = document.createElement('div');
        seat.className = 'seat-box'; seat.id = `seat-${i}`;
        seat.addEventListener('dragover', handleDragOver);
        seat.addEventListener('dragleave', handleDragLeave);
        seat.addEventListener('drop', handleDrop);
        
        const label = (modeVal === '4-3打ち' && i === 3) ? '控（抜け番）' : `${windLabels[i]}家 席`;
        seat.innerHTML = `<span class="seat-label active-wind">${label}</span>`;
        seats.appendChild(seat);
    }
}

function handleDragStart(e) { draggedElement = this; this.style.opacity = '0.4'; }
function handleDragEnd(e) { this.style.opacity = '1'; document.querySelectorAll('.seat-box').forEach(s => s.classList.remove('drag-over')); }
function handleDragOver(e) { e.preventDefault(); this.classList.add('drag-over'); }
function handleDragLeave() { this.classList.remove('drag-over'); }
function handleDrop(e) {
    e.preventDefault(); this.classList.remove('drag-over'); if (!draggedElement) return;
    const existingChip = this.querySelector('.player-chip');
    if (existingChip) { document.getElementById('pool-container').appendChild(existingChip); }
    this.appendChild(draggedElement);
}
let touchOffsetLeft = 0; let touchOffsetTop = 0;

function handleTouchStart(e) {
    draggedElement = this;
    const touch = e.touches[0];
    const rect = this.getBoundingClientRect();
    touchOffsetLeft = touch.clientX - rect.left;
    touchOffsetTop = touch.clientY - rect.top;
    
    this.style.position = 'fixed'; this.style.zIndex = '1000'; this.style.width = `${rect.width}px`;
    moveAt(touch.clientX, touch.clientY);
}

function handleTouchMove(e) {
    if (!draggedElement) return;
    e.preventDefault();
    const touch = e.touches[0];
    moveAt(touch.clientX, touch.clientY);

    const elementTarget = document.elementFromPoint(touch.clientX, touch.clientY);
    document.querySelectorAll('.seat-box, .role-box').forEach(s => s.classList.remove('drag-over'));
    
    if (elementTarget) {
        const targetBox = elementTarget.closest('.seat-box, .winner-target, .loser-target');
        if (targetBox) targetBox.classList.add('drag-over');
    }
}

function moveAt(clientX, clientY) {
    draggedElement.style.left = `${clientX - touchOffsetLeft}px`;
    draggedElement.style.top = `${clientY - touchOffsetTop}px`;
}

function handleTouchEnd(e) {
    if (!draggedElement) return;
    draggedElement.style.position = ''; draggedElement.style.zIndex = ''; draggedElement.style.left = ''; draggedElement.style.top = ''; draggedElement.style.width = '';

    const changedTouch = e.changedTouches[0];
    const elementTarget = document.elementFromPoint(changedTouch.clientX, changedTouch.clientY);
    
    if (elementTarget) {
        const seatBox = elementTarget.closest('.seat-box');
        if (seatBox) {
            const existingChip = seatBox.querySelector('.player-chip');
            if (existingChip) { document.getElementById('pool-container').appendChild(existingChip); }
            seatBox.appendChild(draggedElement);
        } else { document.getElementById('pool-container').appendChild(draggedElement); }
    } else { document.getElementById('pool-container').appendChild(draggedElement); }
    document.querySelectorAll('.seat-box').forEach(s => s.classList.remove('drag-over'));
    draggedElement = null;
}
function startMatch() {
    appState.activePlayers = [];
    const modeVal = document.getElementById('game-mode-select').value;
    
    if (modeVal === '4-3打ち') {
        appState.tableSize = 3;
        for (let i = 0; i < 3; i++) {
            const seatBox = document.getElementById(`seat-${i}`);
            const chip = seatBox.querySelector('.player-chip');
            if (!chip) { alert(`${windLabels[i]}家の席にプレイヤーを配置してください。`); return; }
            appState.activePlayers.push(chip.innerText);
        }
        const seatBox3 = document.getElementById('seat-3');
        const chip3 = seatBox3 ? seatBox3.querySelector('.player-chip') : null;
        if (!chip3) { alert('北家席に4人目の控えプレイヤーを配置してください'); return; }
        appState.subPlayer = chip3.innerText;
    } else {
        appState.tableSize = parseInt(modeVal); appState.subPlayer = null;
        for (let i = 0; i < appState.tableSize; i++) {
            const seatBox = document.getElementById(`seat-${i}`);
            const chip = seatBox.querySelector('.player-chip');
            if (!chip) { alert(`${windLabels[i]}家の席にプレイヤーを配置してください。`); return; }
            appState.activePlayers.push(chip.innerText);
        }
    }

    appState.currentWind = 0; appState.currentKyoku = 1; appState.honbaCount = 0; appState.kyotakuCount = 0;
    appState.activePlayers.forEach(p => appState.currentPoints[p] = 25000);
    if(appState.subPlayer) appState.currentPoints[appState.subPlayer] = 25000;

    updateUIKyokuDisplay(); refreshMatchPlayerList(); clearRoleSlots();
    switchScreen('screen-rules', 'screen-match');
}

function updateUIKyokuDisplay() {
    document.getElementById('current-wind-label').innerText = appState.currentWind === 0 ? '東' : '南';
    document.getElementById('current-kyoku-num').innerText = appState.currentKyoku;
    document.getElementById('current-honba').innerText = `${appState.honbaCount} 本場`;
    document.getElementById('current-kyotaku').innerText = `供託 ${appState.kyotakuCount}本`;
}

function refreshMatchPlayerList() {
    const listContainer = document.getElementById('match-players-list');
    listContainer.innerHTML = '';
    
    for (let i = 0; i < appState.tableSize; i++) {
        const pName = appState.activePlayers[i]; const wind = windLabels[i];
        if (appState.currentPoints[pName] === undefined) { appState.currentPoints[pName] = 25000; }

        const div = document.createElement('div');
        div.className = 'match-row'; div.id = `match-row-${pName}`;
        div.innerHTML = `
            <div class="flex items-center gap-1">
                <span class="wind-badge">${wind}</span>
                <button onclick="declareRiichi('${pName}')" class="btn-riichi">立直</button>
                <div class="match-player-chip" id="m-chip-${i}" draggable="true">${pName}</div>
            </div>
            <input type="number" id="match-pt-${pName}" value="${appState.currentPoints[pName]}" step="100" class="input-score" onchange="syncManualScore('${pName}', this.value)">
        `;

        const chip = div.querySelector('.match-player-chip');
        chip.addEventListener('dragstart', handleDragStart); chip.addEventListener('dragend', handleDragEnd);
        chip.addEventListener('touchstart', handleTouchStart, { passive: false });
        chip.addEventListener('touchmove', handleTouchMove, { passive: false });
        chip.addEventListener('touchend', handleMatchTouchEnd);
        listContainer.appendChild(div);
    }

    const wBox = document.getElementById('role-winner-box'); const lBox = document.getElementById('role-loser-box');
    [wBox, lBox].forEach(box => {
        box.addEventListener('dragover', handleDragOver); box.addEventListener('dragleave', handleDragLeave); box.addEventListener('drop', handleRoleDrop);
    });
}

// 手動入力のスコア変更をリアルタイムセーブに同期
function syncManualScore(pName, value) {
    appState.currentPoints[pName] = parseInt(value) || 0;
    saveToLocalStorage();
}

function declareRiichi(pName) {
    if (appState.currentPoints[pName] < 1000) { alert('持ち点が1,000点未満のため立直できません'); return; }
    appState.currentPoints[pName] -= 1000; appState.kyotakuCount += 1;
    updateUIKyokuDisplay(); refreshMatchPlayerList();
    saveToLocalStorage(); // 🚨状態セーブ
}

function handleRoleDrop(e) {
    e.preventDefault(); this.classList.remove('drag-over'); if (!draggedElement) return;
    const slot = this.querySelector('.role-slot'); const name = draggedElement.innerText;

    if (this.classList.contains('winner-target')) {
        if (matchCalcState.type === 'tenpai') {
            if (!matchCalcState.winners.includes(name)) {
                if (matchCalcState.winners.length === 0) slot.innerHTML = '';
                matchCalcState.winners.push(name);
                const clone = draggedElement.cloneNode(true);
                clone.style.position = ''; clone.style.zIndex = ''; clone.style.width = ''; slot.appendChild(clone);
            }
        } else {
            matchCalcState.winners = [name]; slot.innerHTML = '';
            const clone = draggedElement.cloneNode(true);
            clone.style.position = ''; clone.style.zIndex = ''; clone.style.width = ''; slot.appendChild(clone);
        }
    } else {
        matchCalcState.loser = name; slot.innerHTML = '';
        const clone = draggedElement.cloneNode(true);
        clone.style.position = ''; clone.style.zIndex = ''; clone.style.width = ''; slot.appendChild(clone);
    }
}

function handleMatchTouchEnd(e) {
    if (!draggedElement) return;
    draggedElement.style.position = ''; draggedElement.style.zIndex = ''; draggedElement.style.left = ''; draggedElement.style.top = ''; draggedElement.style.width = '';
    const changedTouch = e.changedTouches[0];
    const targetEl = document.elementFromPoint(changedTouch.clientX, changedTouch.clientY);
    const name = draggedElement.innerText;
    
    if (targetEl) {
        const winnerBox = targetEl.closest('.winner-target'); const loserBox = targetEl.closest('.loser-target');
        if (winnerBox) {
            const slot = winnerBox.querySelector('.role-slot');
            if (matchCalcState.type === 'tenpai') {
                if (!matchCalcState.winners.includes(name)) {
                    if (matchCalcState.winners.length === 0) slot.innerHTML = '';
                    matchCalcState.winners.push(name); slot.innerHTML += `<div class="match-player-chip">${name}</div>`;
                }
            } else { matchCalcState.winners = [name]; slot.innerHTML = `<div class="match-player-chip">${name}</div>`; }
        } else if (loserBox) {
            const slot = loserBox.querySelector('.role-slot'); matchCalcState.loser = name;
            slot.innerHTML = `<div class="match-player-chip">${name}</div>`;
        }
    }
    document.querySelectorAll('.role-box').forEach(b => b.classList.remove('drag-over')); draggedElement = null;
}

function setAgariType(type) {
    matchCalcState.type = type;
    document.getElementById('btn-agari-ron').classList.toggle('active', type === 'ron');
    document.getElementById('btn-agari-tsumo').classList.toggle('active', type === 'tsumo');
    document.getElementById('btn-agari-tenpai').classList.toggle('active-tenpai', type === 'tenpai');
    
    const wLabel = document.getElementById('role-winner-label'); const lLabel = document.getElementById('role-loser-label');
    const scaleBox = document.getElementById('panel-scale-box'); const detailBox = document.getElementById('panel-detail-box');
    clearRoleSlotsOnly();

    if (type === 'tenpai') {
        wLabel.innerText = '⭕ 聴牌者 (それ以外はノーテン)'; lLabel.innerText = '❌ （聴牌時は不使用）';
        document.getElementById('role-loser-box').style.opacity = '0.2'; scaleBox.classList.add('hidden'); detailBox.classList.add('hidden');
    } else {
        wLabel.innerText = '🏆 和了者 (アガリ)'; lLabel.innerText = '🎯 放銃者 (ロンの場合)';
        document.getElementById('role-loser-box').style.opacity = type === 'tsumo' ? '0.3' : '1'; scaleBox.classList.remove('hidden'); detailBox.classList.remove('hidden');
    }
}

function selectManganScale(scale) {
    document.querySelectorAll('.btn-scale').forEach(b => b.classList.remove('active'));
    if (matchCalcState.scale === scale) { matchCalcState.scale = null; } 
    else { matchCalcState.scale = scale; event.target.classList.add('active'); }
}

function clearRoleSlotsOnly() {
    document.getElementById('slot-winner').innerText = 'ここにプレイヤーをドロップ';
    document.getElementById('slot-loser').innerText = 'ここにプレイヤーをドロップ';
    matchCalcState.winners = []; matchCalcState.loser = null; matchCalcState.scale = null;
    document.querySelectorAll('.btn-scale').forEach(b => b.classList.remove('active'));
}
function clearRoleSlots() { clearRoleSlotsOnly(); setAgariType('ron'); }
function executePointTransfer() {
    if (matchCalcState.type !== 'tenpai' && matchCalcState.winners.length === 0) { alert('和了者(アガリ)を設定してください'); return; }
    if (matchCalcState.type === 'ron' && !matchCalcState.loser) { alert('ロンの場合は放銃者を設定してください'); return; }
    
    const currentOyaName = appState.activePlayers[0];
    let isRenchan = false; 

    if (matchCalcState.type === 'tenpai') {
        const tenpaiCount = matchCalcState.winners.length;
        const allActive = appState.activePlayers;
        const noTenCount = allActive.length - tenpaiCount;

        if (tenpaiCount > 0 && noTenCount > 0) {
            let plusScore = 0; let minusScore = 0;
            if (tenpaiCount === 1) { plusScore = 3000; minusScore = 3000 / noTenCount; }
            if (tenpaiCount === 2) { plusScore = 1500; minusScore = 1500; }
            if (tenpaiCount === 3) { plusScore = 1000; minusScore = 3000; }

            allActive.forEach(pName => {
                if (matchCalcState.winners.includes(pName)) { appState.currentPoints[pName] += plusScore; } 
                else { appState.currentPoints[pName] -= minusScore; }
            });
        }
        if (matchCalcState.winners.includes(currentOyaName)) { isRenchan = true; }
        appState.honbaCount += 1;
        alert(`流局精算を完了しました（テンパイ: ${tenpaiCount}人）`);
    } else {
        const winnerName = matchCalcState.winners[0];
        const isWinnerOya = (currentOyaName === winnerName);
        let pointsWinnerGets = 0; let pointsOyaPays = 0; let pointsKoPays = 0;

        if (matchCalcState.scale) {
            if (matchCalcState.scale === 'mangan')     pointsWinnerGets = isWinnerOya ? 12000 : 8000;
            if (matchCalcState.scale === 'hanman')     pointsWinnerGets = isWinnerOya ? 18000 : 12000;
            if (matchCalcState.scale === 'baiman')     pointsWinnerGets = isWinnerOya ? 24000 : 16000;
            if (matchCalcState.scale === 'sanbaiman')  pointsWinnerGets = isWinnerOya ? 36000 : 24000;
            if (matchCalcState.scale === 'yakuman')    pointsWinnerGets = isWinnerOya ? 48000 : 32000;

            if (matchCalcState.type === 'tsumo') {
                if (isWinnerOya) { pointsKoPays = pointsWinnerGets / 2; } 
                else { pointsOyaPays = pointsWinnerGets / 2; pointsKoPays = pointsWinnerGets / 2; }
            }
        } else {
            const han = parseInt(document.getElementById('select-han').value);
            if (han === 1) pointsWinnerGets = isWinnerOya ? 1500 : 1000;
            if (han === 2) pointsWinnerGets = isWinnerOya ? 2900 : 2000;
            if (han === 3) pointsWinnerGets = isWinnerOya ? 5800 : 3900;
            if (han === 4) pointsWinnerGets = isWinnerOya ? 11600 : 7700;

            if (matchCalcState.type === 'tsumo') {
                if (isWinnerOya) { pointsKoPays = Math.ceil((pointsWinnerGets / 2) / 100) * 100; } 
                else { pointsOyaPays = Math.ceil((pointsWinnerGets / 2) / 100) * 100; pointsKoPays = Math.ceil((pointsWinnerGets / 2) / 100) * 100; }
            }
        }

        const honbaValue = appState.honbaCount * 300;
        const honbaTsumoValue = appState.honbaCount * 100;

        if (matchCalcState.type === 'ron') {
            appState.currentPoints[winnerName] += (pointsWinnerGets + honbaValue);
            appState.currentPoints[matchCalcState.loser] -= (pointsWinnerGets + honbaValue);
        } else {
            appState.currentPoints[winnerName] += (pointsWinnerGets + 2 * honbaTsumoValue);
            appState.activePlayers.forEach(pName => {
                if (pName === winnerName) return;
                if (currentOyaName === pName) { appState.currentPoints[pName] -= (pointsOyaPays + honbaTsumoValue); } 
                else { appState.currentPoints[pName] -= (pointsKoPays + honbaTsumoValue); }
            });
        }

        if (appState.kyotakuCount > 0) {
            appState.currentPoints[winnerName] += (appState.kyotakuCount * 1000); appState.kyotakuCount = 0;
        }
        if (isWinnerOya) { isRenchan = true; appState.honbaCount += 1; } else { isRenchan = false; appState.honbaCount = 0; }
    }

    // 4人3打ち自動ローテーション
    if (isRenchan) {
        alert('親の連荘です！交代はありません。');
    } else {
        const modeVal = document.getElementById('game-mode-select').value;
        if (modeVal === '4-3打ち') {
            const oldOya = appState.activePlayers.shift();
            appState.activePlayers.push(appState.subPlayer);
            appState.subPlayer = oldOya;
            appState.currentKyoku += 1;
            if (appState.currentKyoku > 3) { appState.currentKyoku = 1; appState.currentWind += 1; }
            alert(`親移動交代:「${oldOya}」が控えへ、お休みの「${appState.activePlayers[2]}」が卓に入りました！`);
        } else {
            const shiftedPlayer = appState.activePlayers.shift(); appState.activePlayers.push(shiftedPlayer);
            appState.currentKyoku += 1;
            const maxKyoku = appState.tableSize === 3 ? 3 : 4;
            if (appState.currentKyoku > maxKyoku) { appState.currentKyoku = 1; appState.currentWind += 1; }
            alert('親が流れました。');
        }
    }

    updateUIKyokuDisplay(); refreshMatchPlayerList(); clearRoleSlots();
    saveToLocalStorage(); // 🚨状態セーブ
}

function rollDice() {
    const d1 = Math.floor(Math.random() * 6) + 1; const d2 = Math.floor(Math.random() * 6) + 1; const sum = d1 + d2;
    document.getElementById('dice-result').innerText = `出目: ${sum} (${d1}, ${d2})`;
    let targetWind = '';
    if ([5, 9].includes(sum)) targetWind = '東家(自家)';
    else if ([2, 6, 10].includes(sum)) targetWind = '南家(右面)';
    else if ([3, 7, 11].includes(sum)) targetWind = '西家(対面)';
    else if ([4, 8, 12].includes(sum)) targetWind = '北家(左面)';
    document.getElementById('haipai-navi').innerText = `${targetWind}の山、右から${sum}列残して開門`;
}

function endMatch() {
    let currentScores = [];
    for (let i = 0; i < appState.tableSize; i++) {
        const pName = appState.activePlayers[i]; const score = appState.currentPoints[pName];
        currentScores.push({ name: pName, score: score, index: i });
    }
    // 4人3打ちの場合、その局休みだった人のスコア(25000固定等)も精算に巻き込む場合はここへ追加してください
    currentScores.sort((a, b) => b.score - a.score || a.index - b.index);

    const baseReturn = 30000; const is3人 = appState.tableSize === 3;
    const umaRule = document.getElementById('rule-uma').value;
    let uma = is3人 ? [0, 0, 0] : [0, 0, 0, 0];
    if (umaRule === '10-30') uma = is3人 ? [20, 0, -20] : [30, 10, -10, -30];
    if (umaRule === '10-20') uma = is3人 ? [10, 0, -10] : [20, 10, -10, -20];
    const oka = is3人 ? 15 : 20;

    let calculatedRows = [];
    currentScores.forEach((item, rank) => {
        let rawPt = (item.score - baseReturn) / 1000; let roundedPt = Math.round(rawPt);
        let finalPt = roundedPt + uma[rank]; if (rank === 0) finalPt += oka;
        calculatedRows.push({ rank: rank + 1, name: item.name, score: item.score, pt: finalPt });
        appState.stats[item.name] += finalPt;
    });

    appState.gameCount++;
    const tbody = document.getElementById('result-table-body'); tbody.innerHTML = '';
    calculatedRows.forEach(row => {
        const tr = document.createElement('tr'); const ptClass = row.pt >= 0 ? 'pt-plus' : 'pt-minus'; const ptSign = row.pt > 0 ? '+' : '';
        tr.innerHTML = `<td><strong>${row.rank}位</strong></td><td>${row.name}</td><td class="text-right font-mono">${row.score.toLocaleString()}</td><td class="text-right font-mono ${ptClass}">${ptSign}${row.pt.toFixed(1)}</td>`;
        tbody.appendChild(tr);
    });
    switchScreen('screen-match', 'screen-result');
}

function openStats() {
    const tbody = document.getElementById('stats-table-body'); tbody.innerHTML = '';
    let sortedStats = Object.keys(appState.stats).map(name => { return { name: name, pt: appState.stats[name] }; }).sort((a, b) => b.pt - a.pt);
    sortedStats.forEach(item => {
        const tr = document.createElement('tr'); const ptClass = item.pt >= 0 ? 'pt-plus' : 'pt-minus'; const ptSign = item.pt > 0 ? '+' : '';
        tr.innerHTML = `<td><strong>${item.name}</strong></td><td class="text-center font-mono">${appState.gameCount}</td><td class="text-right font-mono ${ptClass}">${ptSign}${item.pt.toFixed(1)}</td>`;
        tbody.appendChild(tr);
    });
    document.getElementById('screen-stats').classList.remove('hidden');
}

function closeStats() { document.getElementById('screen-stats').classList.add('hidden'); }
function nextGame() { switchScreen('screen-result', 'screen-rules'); }
function backToScreen(from) { document.getElementById(from).classList.add('hidden'); document.getElementById('screen-register').classList.remove('hidden'); }

function switchScreen(fromId, toId) {
    document.getElementById(fromId).classList.add('hidden');
    document.getElementById(toId).classList.remove('hidden');
    appState.currentScreen = toId; // 🚨現在の位置を記憶
    saveToLocalStorage();         // 🚨保存
    window.scrollTo(0, 0);
}

// 🎉 大会や別のメンツで完全新規でやり直したい時のための全初期化コマンド（必要に応じてコンソール等から実行、またはボタン配置用）
function resetAllAppStorageData() {
    if(confirm('これまでの累積成績を含むすべてのデータを完全にリセットしますか？')) {
        localStorage.removeItem('mj_manager_state');
        location.reload();
    }
}
