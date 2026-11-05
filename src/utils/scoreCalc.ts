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

