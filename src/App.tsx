import React, { useEffect, useState } from "react";
import {
  AppState,
  CustomRules,
  MatchCalcState,
  MatchLog,
  ResultRow,
  Room,
  TransferDiffItem,
  TransferModalData,
  WIND_LABELS,
} from "./types";
import { RegisterScreen } from "./components/RegisterScreen";
import { RulesScreen } from "./components/RulesScreen";
import { MatchScreen } from "./components/MatchScreen";
import { ResultScreen } from "./components/ResultScreen";
import {
  LogModal,
  StatsModal,
  TransferResultModal,
} from "./components/Modals";

const DEFAULT_RULES: CustomRules = {
  gameMode: "4",
  length: "tonan",
  points: "25000-30000",
  uma: "10-30",
  renchan: "tenpai",
  tobi: "ari",
  kuitan: "ariari",
};

const INITIAL_MATCH_CALC: MatchCalcState = {
  winners: [],
  loser: null,
  type: "ron",
  scale: null,
  fu: 30,
  han: 1,
};

function createInitialState(): AppState {
  return {
    rooms: {
      デフォルトルーム: {
        roomName: "デフォルトルーム",
        gameCount: 0,
        nextPlayerId: 1,
        players: {},
        playerGames: {},
      },
    },
    currentRoomName: "デフォルトルーム",
    allPlayers: [],
    activePlayers: [],
    subPlayer: null,
    seatAssignments: [null, null, null, null],
    currentPoints: {},
    tableSize: 4,
    currentWind: 0,
    currentKyoku: 1,
    honbaCount: 0,
    kyotakuCount: 0,
    riichiPlayers: [],
    currentScreen: "screen-register",
    rules: { ...DEFAULT_RULES },
    matchLogs: [],
    lastResultRows: [],
    dice: {
      resultText: "出目: --",
      naviText: "山取り位置ナビ",
    },
  };
}

function loadStateFromStorage(): AppState {
  const base = createInitialState();
  try {
    const raw = localStorage.getItem("mj_manager_state");
    if (!raw) return base;
    const parsed = JSON.parse(raw);

    const rooms: Record<string, Room> = parsed.rooms || base.rooms;
    if (!rooms["デフォルトルーム"]) {
      rooms["デフォルトルーム"] = {
        roomName: "デフォルトルーム",
        gameCount: 0,
        nextPlayerId: 1,
        players: {},
        playerGames: {},
      };
    }

    // 各ルームのプレイヤー辞書を正規化
    Object.keys(rooms).forEach((rKey) => {
      const r = rooms[rKey];
      if (!r.players) r.players = {};
      if (!r.nextPlayerId) {
        const maxId = Object.keys(r.players).reduce(
          (acc, k) => Math.max(acc, Number(k) || 0),
          0
        );
        r.nextPlayerId = maxId + 1;
      }
      if (typeof r.gameCount !== "number") r.gameCount = 0;
    });

    const currentRoomName =
      parsed.currentRoomName && rooms[parsed.currentRoomName]
        ? parsed.currentRoomName
        : "デフォルトルーム";

    const rules: CustomRules = {
      ...DEFAULT_RULES,
      ...(parsed.rules || {}),
    };

    const allPlayers: number[] = Array.isArray(parsed.allPlayers)
      ? parsed.allPlayers.map((n: unknown) => Number(n))
      : [];
    const activePlayers: number[] = Array.isArray(parsed.activePlayers)
      ? parsed.activePlayers.map((n: unknown) => Number(n))
      : [];
    const subPlayer: number | null =
      parsed.subPlayer !== null && parsed.subPlayer !== undefined
        ? Number(parsed.subPlayer)
        : null;

    const renderSeatsCount =
      rules.gameMode === "4-3打ち" ? 4 : parseInt(rules.gameMode, 10) || 4;

    let seatAssignments: (number | null)[] = Array.isArray(
      parsed.seatAssignments
    )
      ? parsed.seatAssignments
      : [];

    if (seatAssignments.length === 0) {
      if (activePlayers.length > 0) {
        seatAssignments = [...activePlayers];
        if (rules.gameMode === "4-3打ち" && subPlayer !== null) {
          seatAssignments[3] = subPlayer;
        }
      } else {
        seatAssignments = new Array(renderSeatsCount).fill(null);
      }
    }

    return {
      ...base,
      rooms,
      currentRoomName,
      allPlayers,
      activePlayers,
      subPlayer,
      seatAssignments,
      currentPoints: parsed.currentPoints || {},
      tableSize: Number(parsed.tableSize) || 4,
      currentWind: Number(parsed.currentWind) || 0,
      currentKyoku: Number(parsed.currentKyoku) || 1,
      honbaCount: Number(parsed.honbaCount) || 0,
      kyotakuCount: Number(parsed.kyotakuCount) || 0,
      riichiPlayers: Array.isArray(parsed.riichiPlayers)
        ? parsed.riichiPlayers.map((n: unknown) => Number(n))
        : [],
      currentScreen: parsed.currentScreen || "screen-register",
      rules,
      matchLogs: Array.isArray(parsed.matchLogs) ? parsed.matchLogs : [],
      lastResultRows: Array.isArray(parsed.lastResultRows)
        ? parsed.lastResultRows
        : [],
      dice: parsed.dice || base.dice,
    };
  } catch (e) {
    console.error("データ復元エラー。初期画面で起動します。", e);
    return base;
  }
}

export const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(() =>
    loadStateFromStorage()
  );
  const [matchCalc, setMatchCalc] =
    useState<MatchCalcState>(INITIAL_MATCH_CALC);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [transferModal, setTransferModal] = useState<TransferModalData>({
    isOpen: false,
    title: "",
    subtitle: "",
    diffList: [],
    extraInfo: "",
    isTobiEnd: false,
    isRenchan: false,
  });

  // 自動保存
  useEffect(() => {
    try {
      localStorage.setItem("mj_manager_state", JSON.stringify(appState));
    } catch (e) {
      console.error("LocalStorage保存エラー", e);
    }
  }, [appState]);

  const getPlayerName = (id: number): string => {
    const room = appState.rooms[appState.currentRoomName];
    if (room && room.players && room.players[id]) {
      return room.players[id].name;
    }
    return "未知のメンツ";
  };

  // ==========================================
  // 1. メンバー登録・ルーム管理ハンドラ
  // ==========================================
  const handleSelectRoom = (roomName: string) => {
    setAppState((prev) => ({
      ...prev,
      currentRoomName: roomName,
    }));
  };

  const handleCreateRoom = (roomName: string) => {
    setAppState((prev) => {
      const nextRooms = { ...prev.rooms };
      if (!nextRooms[roomName]) {
        nextRooms[roomName] = {
          roomName,
          gameCount: 0,
          nextPlayerId: 1,
          players: {},
          playerGames: {},
        };
      }
      return {
        ...prev,
        rooms: nextRooms,
        currentRoomName: roomName,
      };
    });
  };

  const handleDeleteCurrentRoom = () => {
    const rName = appState.currentRoomName;
    if (rName === "デフォルトルーム") {
      alert(
        "「デフォルトルーム」は削除できません。自分で作成したルームを削除してください。"
      );
      return;
    }
    if (
      window.confirm(
        `本当にルーム「${rName}」を削除しますか？\nこのグループに保存されているメンバーの名前、これまでの全成績が完全に消去されます。`
      )
    ) {
      setAppState((prev) => {
        const nextRooms = { ...prev.rooms };
        delete nextRooms[rName];
        return {
          ...prev,
          rooms: nextRooms,
          currentRoomName: "デフォルトルーム",
          allPlayers: [],
        };
      });
      alert(`ルーム「${rName}」を削除しました。`);
    }
  };

  const handleSubmitRegistration = (
    entries: { id: number | null; name: string }[],
    newRoomName?: string
  ) => {
    const targetRoomName = newRoomName?.trim() || appState.currentRoomName || "デフォルトルーム";
    const existingRoom = appState.rooms[targetRoomName] || {
      roomName: targetRoomName,
      gameCount: 0,
      nextPlayerId: 1,
      players: {},
      playerGames: {},
    };

    const updatedPlayers = { ...existingRoom.players };
    let nextId = existingRoom.nextPlayerId || 1;
    const registeredIds: number[] = [];

    entries.forEach((entry) => {
      const trimmed = entry.name.trim();
      if (!trimmed) return;
      if (entry.id !== null && updatedPlayers[entry.id]) {
        updatedPlayers[entry.id] = {
          ...updatedPlayers[entry.id],
          name: trimmed,
        };
        registeredIds.push(entry.id);
      } else {
        const newId = nextId++;
        updatedPlayers[newId] = {
          id: newId,
          name: trimmed,
          totalGames: 0,
          points: 0,
        };
        registeredIds.push(newId);
      }
    });

    if (registeredIds.length < 3) {
      alert("対局には最低3人以上のメンバーが必要です");
      return;
    }

    const renderSeatsCount =
      appState.rules.gameMode === "4-3打ち"
        ? 4
        : parseInt(appState.rules.gameMode, 10);

    // 既存の席配置のうち今回の参加メンバーに含まれるものは維持
    const nextSeats: (number | null)[] = [];
    for (let i = 0; i < renderSeatsCount; i++) {
      const prevId = appState.seatAssignments[i] ?? null;
      nextSeats.push(
        prevId !== null && registeredIds.includes(prevId) ? prevId : null
      );
    }

    setAppState((prev) => ({
      ...prev,
      rooms: {
        ...prev.rooms,
        [targetRoomName]: {
          ...existingRoom,
          roomName: targetRoomName,
          nextPlayerId: nextId,
          players: updatedPlayers,
        },
      },
      currentRoomName: targetRoomName,
      allPlayers: registeredIds,
      seatAssignments: nextSeats,
      currentScreen: "screen-rules",
    }));
  };

  const handleResetAllData = () => {
    if (
      window.confirm(
        "これまでの累積名簿や全ルーム成績を含むすべてのデータを完全にリセットしますか？"
      )
    ) {
      localStorage.removeItem("mj_manager_state");
      setAppState(createInitialState());
      setMatchCalc(INITIAL_MATCH_CALC);
    }
  };

  // ==========================================
  // 2. ルール・卓設定ハンドラ
  // ==========================================
  const handleUpdateRules = (partial: Partial<CustomRules>) => {
    setAppState((prev) => {
      const nextRules = { ...prev.rules, ...partial };
      const nextTableSize =
        nextRules.gameMode === "4-3打ち"
          ? 3
          : parseInt(nextRules.gameMode, 10) || 4;
      return {
        ...prev,
        rules: nextRules,
        tableSize: nextTableSize,
      };
    });
  };

  const handleUpdateSeats = (newSeats: (number | null)[]) => {
    setAppState((prev) => ({
      ...prev,
      seatAssignments: newSeats,
    }));
  };

  const handleStartMatch = () => {
    const modeVal = appState.rules.gameMode;
    const activePlayers: number[] = [];
    let subPlayer: number | null = null;
    let tableSize = 4;

    if (modeVal === "4-3打ち") {
      tableSize = 3;
      for (let i = 0; i < 3; i++) {
        const pId = appState.seatAssignments[i] ?? null;
        if (pId === null) {
          alert(`${WIND_LABELS[i]}家の席にプレイヤーを配置してください。`);
          return;
        }
        activePlayers.push(pId);
      }
      const subId = appState.seatAssignments[3] ?? null;
      if (subId === null) {
        alert("控えの席に4人目のプレイヤーを配置してください。");
        return;
      }
      subPlayer = subId;
    } else {
      tableSize = parseInt(modeVal, 10) || 4;
      for (let i = 0; i < tableSize; i++) {
        const pId = appState.seatAssignments[i] ?? null;
        if (pId === null) {
          alert(`${WIND_LABELS[i]}家の席にプレイヤーを配置してください。`);
          return;
        }
        activePlayers.push(pId);
      }
    }

    const startPoints =
      parseInt(appState.rules.points.split("-")[0], 10) || 25000;
    const currentPoints: Record<number, number> = {};
    activePlayers.forEach((pId) => {
      currentPoints[pId] = startPoints;
    });
    if (subPlayer !== null) {
      currentPoints[subPlayer] = startPoints;
    }

    setMatchCalc(INITIAL_MATCH_CALC);
    setAppState((prev) => ({
      ...prev,
      activePlayers,
      subPlayer,
      tableSize,
      currentPoints,
      currentWind: 0,
      currentKyoku: 1,
      honbaCount: 0,
      kyotakuCount: 0,
      riichiPlayers: [],
      matchLogs: [],
      dice: {
        resultText: "出目: --",
        naviText: "山取り位置ナビ",
      },
      currentScreen: "screen-match",
    }));
  };

  // ==========================================
  // 3. 対局中ハンドラ
  // ==========================================
  const handleRollDice = () => {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const sum = d1 + d2;
    const resultText = `出目: ${sum} (${d1}, ${d2})`;

    let targetWind = "";
    if ([5, 9].includes(sum)) targetWind = "東家(自家)";
    else if ([2, 6, 10].includes(sum)) targetWind = "南家(右面)";
    else if ([3, 7, 11].includes(sum)) targetWind = "西家(対面)";
    else if ([4, 8, 12].includes(sum)) targetWind = "北家(左面)";

    const naviText = `${targetWind}の山、右から${sum}列残して開門`;

    setAppState((prev) => ({
      ...prev,
      dice: { resultText, naviText },
    }));
  };

  const handleDeclareRiichi = (playerId: number) => {
    if (appState.riichiPlayers.includes(playerId)) {
      alert(`${getPlayerName(playerId)} はすでに立直しています。`);
      return;
    }
    const currentPt = appState.currentPoints[playerId] ?? 0;
    if (currentPt < 1000) {
      alert(
        "持ち点が1,000点未満のため立直できません（仕様Aにより1,000点あれば立直して0点続行が可能です）"
      );
      return;
    }

    setAppState((prev) => ({
      ...prev,
      currentPoints: {
        ...prev.currentPoints,
        [playerId]: (prev.currentPoints[playerId] ?? 0) - 1000,
      },
      kyotakuCount: prev.kyotakuCount + 1,
      riichiPlayers: [...prev.riichiPlayers, playerId],
    }));

    setMatchCalc((prev) => {
      if (prev.type === "tenpai" && !prev.winners.includes(playerId)) {
        return {
          ...prev,
          winners: [...prev.winners, playerId],
        };
      }
      return prev;
    });
  };

  const handleManualScoreChange = (playerId: number, score: number) => {
    setAppState((prev) => ({
      ...prev,
      currentPoints: {
        ...prev.currentPoints,
        [playerId]: score,
      },
    }));
  };

  const handleUpdateMatchCalc = (partial: Partial<MatchCalcState>) => {
    setMatchCalc((prev) => ({ ...prev, ...partial }));
  };

  const handleClearRoleSlots = () => {
    setMatchCalc(INITIAL_MATCH_CALC);
  };

  const finalizeEndMatch = (pointsSnapshot: Record<number, number>, logsSnapshot: MatchLog[]) => {
    const tableSize = appState.tableSize;
    const currentScores: { id: number; score: number; index: number }[] = [];
    for (let i = 0; i < tableSize; i++) {
      const pId = appState.activePlayers[i];
      const score = pointsSnapshot[pId] ?? 0;
      currentScores.push({ id: pId, score, index: i });
    }
    currentScores.sort((a, b) => b.score - a.score || a.index - b.index);

    const parts = appState.rules.points.split("-");
    const startPoints = parseInt(parts[0], 10) || 25000;
    const baseReturn = parseInt(parts[1], 10) || 30000;

    const is3P = tableSize === 3;
    const numPlayers = is3P ? 3 : 4;
    const oka = ((baseReturn - startPoints) * numPlayers) / 1000;

    const umaRule = appState.rules.uma;
    let uma = is3P ? [10, 0, -10] : [20, 10, -10, -20];
    if (umaRule === "10-30") uma = is3P ? [20, 0, -20] : [30, 10, -10, -30];
    if (umaRule === "10-20") uma = is3P ? [10, 0, -10] : [20, 10, -10, -20];
    if (umaRule === "none") uma = is3P ? [0, 0, 0] : [0, 0, 0, 0];

    const calculatedRows: ResultRow[] = [];
    const room = appState.rooms[appState.currentRoomName];
    const updatedPlayers = { ...(room?.players || {}) };

    currentScores.forEach((item, rank) => {
      const rawPt = (item.score - baseReturn) / 1000;
      const roundedPt = Math.round(rawPt);
      let finalPt = roundedPt + uma[rank];
      if (rank === 0) finalPt += oka;

      calculatedRows.push({
        rank: rank + 1,
        name: getPlayerName(item.id),
        score: item.score,
        pt: finalPt,
      });

      if (updatedPlayers[item.id]) {
        updatedPlayers[item.id] = {
          ...updatedPlayers[item.id],
          points: (updatedPlayers[item.id].points || 0) + finalPt,
          totalGames: (updatedPlayers[item.id].totalGames || 0) + 1,
        };
      }
    });

    setAppState((prev) => ({
      ...prev,
      currentPoints: pointsSnapshot,
      matchLogs: logsSnapshot,
      rooms: {
        ...prev.rooms,
        [prev.currentRoomName]: {
          ...prev.rooms[prev.currentRoomName],
          gameCount: (prev.rooms[prev.currentRoomName]?.gameCount || 0) + 1,
          players: updatedPlayers,
        },
      },
      lastResultRows: calculatedRows,
      currentScreen: "screen-result",
    }));
  };

  const handleExecutePointTransfer = () => {
    if (matchCalc.type !== "tenpai" && matchCalc.winners.length === 0) {
      alert("和了者(アガリ)を設定してください");
      return;
    }
    if (matchCalc.type === "ron" && matchCalc.loser === null) {
      alert("ロンの場合は放銃者を設定してください");
      return;
    }

    const tableSize = appState.tableSize;
    const oyaSeatIndex = (appState.currentKyoku - 1) % tableSize;
    const currentOyaId = appState.activePlayers[oyaSeatIndex];
    let isRenchan = false;

    const currentHonba = appState.honbaCount;
    const honbaRonValue = currentHonba * 300;
    const honbaTsumoValue = currentHonba * 100;

    const nextPoints = { ...appState.currentPoints };
    let nextHonba = appState.honbaCount;
    let nextKyotaku = appState.kyotakuCount;

    const currentLogObj: MatchLog = {
      title: `${appState.currentWind === 0 ? "東" : "南"}${
        appState.currentKyoku
      }局　${currentHonba}本場`,
      rows: [],
      isTobiEnd: false,
      tobiPlayer: "",
    };

    let modalSubtitle = "";
    let modalExtraInfo = "";
    const diffList: TransferDiffItem[] = [];

    if (matchCalc.type === "tenpai") {
      modalSubtitle = "荒牌流局（ノーテン罰符）";
      const tenpaiCount = matchCalc.winners.length;
      const allActive = appState.activePlayers.slice(0, tableSize);
      const noTenCount = allActive.length - tenpaiCount;

      if (tenpaiCount > 0 && noTenCount > 0) {
        let plusScore = 0;
        let minusScore = 0;
        if (tenpaiCount === 1) {
          plusScore = 3000;
          minusScore = 3000 / noTenCount;
        } else if (tenpaiCount === 2) {
          plusScore = 1500;
          minusScore = 3000 / noTenCount;
        } else if (tenpaiCount === 3) {
          plusScore = 1000;
          minusScore = 3000;
        }

        allActive.forEach((pId) => {
          if (matchCalc.winners.includes(pId)) {
            nextPoints[pId] = (nextPoints[pId] ?? 0) + plusScore;
            currentLogObj.rows.push({
              type: "荒牌　　",
              name: getPlayerName(pId),
              pt: plusScore,
            });
            diffList.push({ name: getPlayerName(pId), diff: plusScore });
          } else {
            nextPoints[pId] = (nextPoints[pId] ?? 0) - minusScore;
            currentLogObj.rows.push({
              type: "　　　　",
              name: getPlayerName(pId),
              pt: -minusScore,
            });
            diffList.push({ name: getPlayerName(pId), diff: -minusScore });
          }
        });
      } else {
        allActive.forEach((pId) => {
          currentLogObj.rows.push({
            type: "荒牌　　",
            name: getPlayerName(pId),
            pt: 0,
          });
          diffList.push({ name: getPlayerName(pId), diff: 0 });
        });
        modalExtraInfo = "全員聴牌、または全員不聴（点数移動なし）";
      }

      isRenchan =
        appState.rules.renchan === "tenpai" &&
        matchCalc.winners.includes(currentOyaId);
      nextHonba += 1;
      modalExtraInfo +=
        (modalExtraInfo ? "<br>" : "") +
        `本場を+1します（現在: ${nextHonba}本場）`;
    } else {
      const winnerId = matchCalc.winners[0];
      const isWinnerOya = currentOyaId === winnerId;
      let pointsWinnerGets = 0;
      let pointsOyaPays = 0;
      let pointsKoPays = 0;

      if (matchCalc.scale) {
        const scaleNames: Record<string, string> = {
          mangan: "満貫",
          hanman: "跳満",
          baiman: "倍満",
          sanbaiman: "三倍満",
          yakuman: "役満",
        };
        modalSubtitle = `${
          matchCalc.type === "ron" ? "ロン和了" : "ツモ和了"
        }（${scaleNames[matchCalc.scale]}）`;
        if (matchCalc.scale === "mangan")
          pointsWinnerGets = isWinnerOya ? 12000 : 8000;
        if (matchCalc.scale === "hanman")
          pointsWinnerGets = isWinnerOya ? 18000 : 12000;
        if (matchCalc.scale === "baiman")
          pointsWinnerGets = isWinnerOya ? 24000 : 16000;
        if (matchCalc.scale === "sanbaiman")
          pointsWinnerGets = isWinnerOya ? 36000 : 24000;
        if (matchCalc.scale === "yakuman")
          pointsWinnerGets = isWinnerOya ? 48000 : 32000;

        if (matchCalc.type === "tsumo") {
          if (isWinnerOya) {
            pointsKoPays = pointsWinnerGets / (tableSize - 1);
          } else {
            pointsOyaPays = pointsWinnerGets / 2;
            pointsKoPays = pointsWinnerGets / 4;
            if (tableSize === 3) {
              pointsWinnerGets = pointsOyaPays + pointsKoPays;
            }
          }
        }
      } else {
        const { han, fu } = matchCalc;
        modalSubtitle = `${
          matchCalc.type === "ron" ? "ロン和了" : "ツモ和了"
        }（${han}翻 ${fu}符）`;

        if ((han === 3 && fu >= 60) || (han === 4 && fu >= 30) || han >= 5) {
          pointsWinnerGets = isWinnerOya ? 12000 : 8000;
          if (matchCalc.type === "tsumo") {
            if (isWinnerOya) {
              pointsKoPays = pointsWinnerGets / (tableSize - 1);
            } else {
              pointsOyaPays = pointsWinnerGets / 2;
              pointsKoPays = pointsWinnerGets / 4;
              if (tableSize === 3) {
                pointsWinnerGets = pointsOyaPays + pointsKoPays;
              }
            }
          }
        } else {
          const baseScore = fu * Math.pow(2, han + 2);
          if (matchCalc.type === "ron") {
            const rawScore = isWinnerOya ? baseScore * 6 : baseScore * 4;
            pointsWinnerGets = Math.ceil(rawScore / 100) * 100;
          } else {
            if (isWinnerOya) {
              pointsKoPays = Math.ceil((baseScore * 2) / 100) * 100;
              pointsWinnerGets = pointsKoPays * (tableSize - 1);
            } else {
              pointsOyaPays = Math.ceil((baseScore * 4) / 100) * 100;
              pointsKoPays = Math.ceil((baseScore * 2) / 100) * 100;
              pointsWinnerGets =
                pointsOyaPays +
                pointsKoPays * (tableSize - 1 - (tableSize === 3 ? 1 : 0));
            }
          }
        }
      }

      if (matchCalc.type === "ron" && matchCalc.loser !== null) {
        const finalGet = pointsWinnerGets + honbaRonValue;
        nextPoints[winnerId] = (nextPoints[winnerId] ?? 0) + finalGet;
        nextPoints[matchCalc.loser] =
          (nextPoints[matchCalc.loser] ?? 0) - finalGet;

        currentLogObj.rows.push({
          type: "ロン和　",
          name: getPlayerName(winnerId),
          pt: finalGet,
        });
        currentLogObj.rows.push({
          type: "放銃　　",
          name: getPlayerName(matchCalc.loser),
          pt: -finalGet,
        });

        diffList.push({ name: getPlayerName(winnerId), diff: finalGet });
        diffList.push({
          name: getPlayerName(matchCalc.loser),
          diff: -finalGet,
        });
      } else {
        const finalGet =
          pointsWinnerGets + (tableSize - 1) * honbaTsumoValue;
        nextPoints[winnerId] = (nextPoints[winnerId] ?? 0) + finalGet;
        currentLogObj.rows.push({
          type: "ツモ和　",
          name: getPlayerName(winnerId),
          pt: finalGet,
        });
        diffList.push({ name: getPlayerName(winnerId), diff: finalGet });

        appState.activePlayers.slice(0, tableSize).forEach((pId) => {
          if (pId === winnerId) return;
          const loss =
            (currentOyaId === pId ? pointsOyaPays : pointsKoPays) +
            honbaTsumoValue;
          nextPoints[pId] = (nextPoints[pId] ?? 0) - loss;
          currentLogObj.rows.push({
            type: "　　　　",
            name: getPlayerName(pId),
            pt: -loss,
          });
          diffList.push({ name: getPlayerName(pId), diff: -loss });
        });
      }

      if (nextKyotaku > 0) {
        const kPt = nextKyotaku * 1000;
        nextPoints[winnerId] = (nextPoints[winnerId] ?? 0) + kPt;
        currentLogObj.rows.push({
          type: "供託回収",
          name: getPlayerName(winnerId),
          pt: kPt,
        });
        modalExtraInfo += `供託棒 ${nextKyotaku}本（+${kPt.toLocaleString()}点）を獲得<br>`;
        nextKyotaku = 0;
      }

      if (isWinnerOya) {
        isRenchan = true;
        nextHonba += 1;
        modalExtraInfo += `親の和了（連荘）本場+1 ➔ ${nextHonba}本場`;
      } else {
        isRenchan = false;
        nextHonba = 0;
        modalExtraInfo += `子のアガリ（本場リセット ➔ 0本場）`;
      }
    }

    // 飛び判定
    let hasTobiPlayer = false;
    let tobiPlayerName = "";
    appState.activePlayers.slice(0, tableSize).forEach((pId) => {
      if ((nextPoints[pId] ?? 0) < 0) {
        hasTobiPlayer = true;
        tobiPlayerName = getPlayerName(pId);
      }
    });

    const isTobiEnd = appState.rules.tobi === "ari" && hasTobiPlayer;
    if (isTobiEnd) {
      currentLogObj.isTobiEnd = true;
      currentLogObj.tobiPlayer = tobiPlayerName;
      modalExtraInfo += `<br><span style="color:#f43f5e;font-weight:bold;">🚨 ぶっ飛び：${tobiPlayerName}が0点未満のためコールド終局</span>`;
    }

    const nextLogs = [...appState.matchLogs, currentLogObj];

    setAppState((prev) => ({
      ...prev,
      currentPoints: nextPoints,
      honbaCount: nextHonba,
      kyotakuCount: nextKyotaku,
      matchLogs: nextLogs,
    }));

    setTransferModal({
      isOpen: true,
      title: `${appState.currentWind === 0 ? "東" : "南"}${
        appState.currentKyoku
      }局 ${currentHonba}本場 精算`,
      subtitle: modalSubtitle,
      diffList,
      extraInfo: modalExtraInfo,
      isTobiEnd,
      isRenchan,
    });
  };

  const handleConfirmPointTransferNext = () => {
    const { isTobiEnd, isRenchan } = transferModal;
    setTransferModal((prev) => ({ ...prev, isOpen: false }));

    if (isTobiEnd) {
      finalizeEndMatch(appState.currentPoints, appState.matchLogs);
      return;
    }

    setAppState((prev) => {
      let nextKyoku = prev.currentKyoku;
      let nextWind = prev.currentWind;
      const nextActive = [...prev.activePlayers];
      let nextSub = prev.subPlayer;

      if (!isRenchan) {
        if (prev.rules.gameMode === "4-3打ち" && nextSub !== null) {
          const currentOyaIndex = (prev.currentKyoku - 1) % 3;
          const oldOya = nextActive[currentOyaIndex];
          nextActive[currentOyaIndex] = nextSub;
          nextSub = oldOya;
          nextKyoku += 1;
          if (nextKyoku > 3) {
            nextKyoku = 1;
            nextWind += 1;
          }
        } else {
          nextKyoku += 1;
          const maxKyoku = prev.tableSize === 3 ? 3 : 4;
          if (nextKyoku > maxKyoku) {
            nextKyoku = 1;
            nextWind += 1;
          }
        }
      }

      return {
        ...prev,
        activePlayers: nextActive,
        subPlayer: nextSub,
        currentKyoku: nextKyoku,
        currentWind: nextWind,
        riichiPlayers: [],
      };
    });

    setMatchCalc(INITIAL_MATCH_CALC);
  };

  const handleEndMatch = () => {
    finalizeEndMatch(appState.currentPoints, appState.matchLogs);
  };

  return (
    <>
      {appState.currentScreen === "screen-register" && (
        <RegisterScreen
          rooms={appState.rooms}
          currentRoomName={appState.currentRoomName}
          allPlayers={appState.allPlayers}
          onSelectRoom={handleSelectRoom}
          onCreateRoom={handleCreateRoom}
          onDeleteCurrentRoom={handleDeleteCurrentRoom}
          onSubmitRegistration={handleSubmitRegistration}
          onResetAllData={handleResetAllData}
        />
      )}

      {appState.currentScreen === "screen-rules" && (
        <RulesScreen
          allPlayers={appState.allPlayers}
          seatAssignments={appState.seatAssignments}
          rules={appState.rules}
          getPlayerName={getPlayerName}
          onUpdateRules={handleUpdateRules}
          onUpdateSeats={handleUpdateSeats}
          onStartMatch={handleStartMatch}
          onBackToRegister={() =>
            setAppState((prev) => ({
              ...prev,
              currentScreen: "screen-register",
            }))
          }
        />
      )}

      {appState.currentScreen === "screen-match" && (
        <MatchScreen
          activePlayers={appState.activePlayers}
          subPlayer={appState.subPlayer}
          currentPoints={appState.currentPoints}
          tableSize={appState.tableSize}
          currentWind={appState.currentWind}
          currentKyoku={appState.currentKyoku}
          honbaCount={appState.honbaCount}
          kyotakuCount={appState.kyotakuCount}
          riichiPlayers={appState.riichiPlayers}
          rules={appState.rules}
          dice={appState.dice}
          matchCalc={matchCalc}
          getPlayerName={getPlayerName}
          onRollDice={handleRollDice}
          onDeclareRiichi={handleDeclareRiichi}
          onManualScoreChange={handleManualScoreChange}
          onUpdateMatchCalc={handleUpdateMatchCalc}
          onClearRoleSlots={handleClearRoleSlots}
          onExecutePointTransfer={handleExecutePointTransfer}
          onOpenLogModal={() => setIsLogOpen(true)}
          onEndMatch={handleEndMatch}
        />
      )}

      {appState.currentScreen === "screen-result" && (
        <ResultScreen
          resultRows={appState.lastResultRows}
          onOpenLogModal={() => setIsLogOpen(true)}
          onOpenStatsModal={() => setIsStatsOpen(true)}
          onNextGame={() =>
            setAppState((prev) => ({
              ...prev,
              currentScreen: "screen-rules",
            }))
          }
        />
      )}

      <StatsModal
        isOpen={isStatsOpen}
        roomName={appState.currentRoomName}
        room={appState.rooms[appState.currentRoomName]}
        onClose={() => setIsStatsOpen(false)}
      />

      <LogModal
        isOpen={isLogOpen}
        matchLogs={appState.matchLogs}
        onClose={() => setIsLogOpen(false)}
      />

      <TransferResultModal
        data={transferModal}
        onConfirmNext={handleConfirmPointTransferNext}
      />
    </>
  );
};

