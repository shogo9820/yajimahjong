import { ManganScale } from "../types";

export const SCALE_NAMES: Record<Exclude<ManganScale, null>, string> = {
  mangan: "満貫",
  hanman: "跳満",
  baiman: "倍満",
  sanbaiman: "三倍満",
  yakuman: "役満",
  double_yakuman: "W役満",
};

export function formatHandShortLabel(
  scale: ManganScale,
  han: number,
  fu: number
): string {
  if (scale) return SCALE_NAMES[scale];
  return `${han}翻${fu}符`;
}

export function calcHandPoints(
  isWinnerOya: boolean,
  type: "ron" | "tsumo",
  scale: ManganScale,
  han: number,
  fu: number,
  tableSize: number,
  sanmaTsumo: "tsumozon" | "marutori"
): {
  pointsWinnerGets: number;
  pointsOyaPays: number;
  pointsKoPays: number;
} {
  let pointsWinnerGets = 0;
  let pointsOyaPays = 0;
  let pointsKoPays = 0;

  const isManganOrAbove =
    scale !== null ||
    (han === 3 && fu >= 60) ||
    (han === 4 && fu >= 30) ||
    han >= 5;

  if (isManganOrAbove) {
    const effScale = scale || "mangan";
    if (effScale === "mangan") pointsWinnerGets = isWinnerOya ? 12000 : 8000;
    else if (effScale === "hanman")
      pointsWinnerGets = isWinnerOya ? 18000 : 12000;
    else if (effScale === "baiman")
      pointsWinnerGets = isWinnerOya ? 24000 : 16000;
    else if (effScale === "sanbaiman")
      pointsWinnerGets = isWinnerOya ? 36000 : 24000;
    else if (effScale === "yakuman")
      pointsWinnerGets = isWinnerOya ? 48000 : 32000;
    else if (effScale === "double_yakuman")
      pointsWinnerGets = isWinnerOya ? 96000 : 64000;

    if (type === "tsumo") {
      if (tableSize === 4) {
        if (isWinnerOya) {
          pointsKoPays = pointsWinnerGets / 3;
        } else {
          pointsOyaPays = pointsWinnerGets / 2;
          pointsKoPays = pointsWinnerGets / 4;
        }
      } else {
        if (sanmaTsumo === "marutori") {
          if (isWinnerOya) {
            pointsKoPays = Math.ceil(pointsWinnerGets / 2 / 100) * 100;
            pointsWinnerGets = pointsKoPays * 2;
          } else {
            const baseOya = pointsWinnerGets / 2;
            const baseKo = pointsWinnerGets / 4;
            const northHalf = Math.ceil(baseKo / 2 / 100) * 100;
            pointsOyaPays = baseOya + northHalf;
            pointsKoPays = baseKo + northHalf;
            pointsWinnerGets = pointsOyaPays + pointsKoPays;
          }
        } else {
          if (isWinnerOya) {
            pointsKoPays = pointsWinnerGets / 3;
            pointsWinnerGets = pointsKoPays * 2;
          } else {
            pointsOyaPays = pointsWinnerGets / 2;
            pointsKoPays = pointsWinnerGets / 4;
            pointsWinnerGets = pointsOyaPays + pointsKoPays;
          }
        }
      }
    }
  } else {
    const baseScore = fu * Math.pow(2, han + 2);
    if (type === "ron") {
      const rawScore = isWinnerOya ? baseScore * 6 : baseScore * 4;
      pointsWinnerGets = Math.ceil(rawScore / 100) * 100;
    } else {
      const stdOyaPay = Math.ceil((baseScore * 4) / 100) * 100;
      const stdKoPay = Math.ceil((baseScore * 2) / 100) * 100;
      if (tableSize === 4) {
        if (isWinnerOya) {
          pointsKoPays = stdKoPay;
          pointsWinnerGets = pointsKoPays * 3;
        } else {
          pointsOyaPays = stdOyaPay;
          pointsKoPays = stdKoPay;
          pointsWinnerGets = pointsOyaPays + pointsKoPays * 2;
        }
      } else {
        if (sanmaTsumo === "marutori") {
          if (isWinnerOya) {
            const total4P = stdKoPay * 3;
            pointsKoPays = Math.ceil(total4P / 2 / 100) * 100;
            pointsWinnerGets = pointsKoPays * 2;
          } else {
            const northHalf = Math.ceil(stdKoPay / 2 / 100) * 100;
            pointsOyaPays = stdOyaPay + northHalf;
            pointsKoPays = stdKoPay + northHalf;
            pointsWinnerGets = pointsOyaPays + pointsKoPays;
          }
        } else {
          if (isWinnerOya) {
            pointsKoPays = stdKoPay;
            pointsWinnerGets = pointsKoPays * 2;
          } else {
            pointsOyaPays = stdOyaPay;
            pointsKoPays = stdKoPay;
            pointsWinnerGets = pointsOyaPays + pointsKoPays;
          }
        }
      }
    }
  }

  return { pointsWinnerGets, pointsOyaPays, pointsKoPays };
}

export interface ComebackConditionResult {
  isAhead: boolean;
  tsumoLabel: string;
  directRonLabel: string;
}

const TSUMO_CANDIDATES: { fu: number; han: number; scale: ManganScale }[] = [
  { fu: 30, han: 1, scale: null }, // 子:300/500, 親:500オール
  { fu: 20, han: 2, scale: null }, // 子:400/700, 親:700オール (ピンフツモ / 40符1翻)
  { fu: 30, han: 2, scale: null }, // 子:500/1000, 親:1000オール
  { fu: 40, han: 2, scale: null }, // 子:700/1300, 親:1300オール (20符3翻ピンフツモ含む)
  { fu: 25, han: 3, scale: null }, // 子:800/1600, 親:1600オール (七対子ツモ / 50符2翻)
  { fu: 30, han: 3, scale: null }, // 子:1000/2000, 親:2000オール
  { fu: 40, han: 3, scale: null }, // 子:1300/2600, 親:2600オール (20符4翻ピンフツモ含む)
  { fu: 25, han: 4, scale: null }, // 子:1600/3200, 親:3200オール (七対子4翻 / 50符3翻)
  { fu: 30, han: 5, scale: "mangan" },
  { fu: 30, han: 6, scale: "hanman" },
  { fu: 30, han: 8, scale: "baiman" },
  { fu: 30, han: 11, scale: "sanbaiman" },
  { fu: 30, han: 13, scale: "yakuman" },
  { fu: 30, han: 26, scale: "double_yakuman" },
];

const RON_CANDIDATES: { fu: number; han: number; scale: ManganScale }[] = [
  { fu: 30, han: 1, scale: null }, // 子:1000, 親:1500
  { fu: 40, han: 1, scale: null }, // 子:1300, 親:2000
  { fu: 25, han: 2, scale: null }, // 子:1600, 親:2400 (七対子 / 50符1翻)
  { fu: 30, han: 2, scale: null }, // 子:2000, 親:2900
  { fu: 40, han: 2, scale: null }, // 子:2600, 親:3900
  { fu: 25, han: 3, scale: null }, // 子:3200, 親:4800 (七対子3翻 / 50符2翻)
  { fu: 30, han: 3, scale: null }, // 子:3900, 親:5800
  { fu: 40, han: 3, scale: null }, // 子:5200, 親:7700
  { fu: 25, han: 4, scale: null }, // 子:6400, 親:9600 (七対子4翻 / 50符3翻)
  { fu: 30, han: 4, scale: null }, // 子:7700, 親:11600
  { fu: 30, han: 5, scale: "mangan" },
  { fu: 30, han: 6, scale: "hanman" },
  { fu: 30, han: 8, scale: "baiman" },
  { fu: 30, han: 11, scale: "sanbaiman" },
  { fu: 30, han: 13, scale: "yakuman" },
  { fu: 30, han: 26, scale: "double_yakuman" },
];

const SHORT_SCALE_LABELS: Record<Exclude<ManganScale, null>, string> = {
  mangan: "満貫",
  hanman: "跳満",
  baiman: "倍満",
  sanbaiman: "3倍満",
  yakuman: "役満",
  double_yakuman: "W役満",
};

/**
 * 基準プレイヤー(base)が対象プレイヤー(target)を逆転するために必要な
 * 「ツモ条件」と「直撃条件」をパターン①（満貫未満は点数表記、満貫以上は満貫〜W役満表記）で算出する
 */
export function calcComebackCondition(params: {
  baseScore: number;
  targetScore: number;
  isBaseOya: boolean;
  isTargetOya: boolean;
  honbaCount: number;
  kyotakuCount: number;
  tableSize: number;
  sanmaTsumo: "tsumozon" | "marutori";
  canOvertakeOnTie: boolean;
}): ComebackConditionResult {
  const {
    baseScore,
    targetScore,
    isBaseOya,
    isTargetOya,
    honbaCount,
    kyotakuCount,
    tableSize,
    sanmaTsumo,
    canOvertakeOnTie,
  } = params;

  const isAlreadyAhead = canOvertakeOnTie
    ? baseScore >= targetScore
    : baseScore > targetScore;

  if (isAlreadyAhead) {
    return {
      isAhead: true,
      tsumoLabel: "",
      directRonLabel: "",
    };
  }

  const kyotakuBonus = kyotakuCount * 1000;
  const honbaTsumoUnit = honbaCount * 100;
  const honbaRonTotal = honbaCount * 300;

  // 1. ツモ条件の探索
  let tsumoLabel = "W役満超";
  for (const cand of TSUMO_CANDIDATES) {
    const res = calcHandPoints(
      isBaseOya,
      "tsumo",
      cand.scale,
      cand.han,
      cand.fu,
      tableSize,
      sanmaTsumo
    );
    const newBase =
      baseScore +
      res.pointsWinnerGets +
      honbaTsumoUnit * (tableSize - 1) +
      kyotakuBonus;
    const targetLoss =
      (isTargetOya ? res.pointsOyaPays : res.pointsKoPays) + honbaTsumoUnit;
    const newTarget = targetScore - targetLoss;

    const overtaken = canOvertakeOnTie
      ? newBase >= newTarget
      : newBase > newTarget;

    if (overtaken) {
      if (cand.scale !== null) {
        tsumoLabel = SHORT_SCALE_LABELS[cand.scale];
      } else if (isBaseOya) {
        tsumoLabel = `${res.pointsKoPays}オール`;
      } else {
        tsumoLabel = `${res.pointsKoPays}/${res.pointsOyaPays}`;
      }
      break;
    }
  }

  // 2. 直撃条件の探索
  let directRonLabel = "W役満超";
  for (const cand of RON_CANDIDATES) {
    const res = calcHandPoints(
      isBaseOya,
      "ron",
      cand.scale,
      cand.han,
      cand.fu,
      tableSize,
      sanmaTsumo
    );
    const newBase =
      baseScore + res.pointsWinnerGets + honbaRonTotal + kyotakuBonus;
    const newTarget = targetScore - (res.pointsWinnerGets + honbaRonTotal);

    const overtaken = canOvertakeOnTie
      ? newBase >= newTarget
      : newBase > newTarget;

    if (overtaken) {
      if (cand.scale !== null) {
        directRonLabel = SHORT_SCALE_LABELS[cand.scale];
      } else {
        directRonLabel = `${res.pointsWinnerGets}`;
      }
      break;
    }
  }

  return {
    isAhead: false,
    tsumoLabel,
    directRonLabel,
  };
}


