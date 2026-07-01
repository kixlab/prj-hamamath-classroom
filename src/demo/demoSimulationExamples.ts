/** 4단계 루브릭 시뮬레이션(상·중·하) 예시 답안 — 학생 진단 데모용 */
import type { DemoProblemKey } from "./demoProfiles";

export type DemoLevel = "상" | "중" | "하";

export type DemoSimulationExamples = Record<
  string,
  Record<DemoLevel, string[]>
>;

export const DEMO_SIMULATION_EXAMPLES: DemoSimulationExamples = {
  "1-1": {
    상: [
      "동화책은 314쪽이다.\n민영이는 매일 23쪽씩 읽는다.",
      "전체 314쪽이고, 하루에 23쪽씩 읽는다는 조건이 중요하다.",
    ],
    중: [
      "동화책은 314쪽이고, 며칠이 걸리는지 구해야 한다.",
      "민영이가 매일 책을 읽는다.",
    ],
    하: [
      "민영이가 책을 읽는다.",
      "314와 23이 문제에 나온다.",
    ],
  },
  "1-2": {
    상: ["동화책을 끝까지 읽는 데 걸리는 일수", "며칠 만에 책을 다 읽는지 구하는 것이다."],
    중: ["책을 다 읽는 데 필요한 날 수", "읽는 데 걸리는 시간"],
    하: ["하루에 읽는 쪽수", "314를 23으로 나눈 값"],
  },
  "2-1": {
    상: ["314 ÷ 23", "전체 쪽수를 하루에 읽는 쪽수로 나눈다."],
    중: ["314를 23으로 나눈다.", "나눗셈을 해야 한다."],
    하: ["314 + 23", "314 × 23"],
  },
  "2-2": {
    상: [
      "몫은 23쪽씩 읽는 날 수이고, 나머지는 마지막에 더 읽어야 하는 쪽수이다.",
      "몫은 꽉 찬 날 수, 나머지는 마지막에 더 읽는 쪽수다.",
    ],
    중: ["몫은 읽는 날 수, 나머지는 남은 쪽수이다.", "나눗셈의 몫과 나머지를 구한다."],
    하: ["몫과 나머지를 더하면 된다.", "몫만 구하면 된다."],
  },
  "3-1": {
    상: ["몫에 1일을 더한다.", "나머지가 있으면 하루를 더 읽어야 한다."],
    중: ["나머지가 있으면 하루를 더 읽는다.", "올림해서 일수를 구한다."],
    하: ["나머지를 버린다.", "몫만 답으로 쓴다."],
  },
  "3-2": {
    상: ["$$314 \\div 23$$", "$314 \\div 23$"],
    중: ["314/23", "314 나누기 23"],
    하: ["314 × 23", "314 + 23"],
  },
  "4-1": {
    상: ["$13 \\ldots 15$", "13 remainder 15"],
    중: ["13", "13.5"],
    하: ["13.57", "14"],
  },
  "4-2": {
    상: ["14일", "14일이 걸린다."],
    중: ["13일", "약 14일"],
    하: ["15일", "13일"],
  },
};

export const DEMO_SIMULATION_EXAMPLES_EXAMPLE4: DemoSimulationExamples = {
  "1-1": {
    상: ["우유는 1L(1000mL)이다.\n지호는 250mL를 마셨다.\n혜원은 300mL를 마셨다."],
    중: ["우유 1L, 지호와 혜원이 마셨다.", "1000mL에서 일부를 마셨다."],
    하: ["우유가 있다.", "250과 300이 나온다."],
  },
  "1-2": {
    상: ["남은 우유의 양(mL)", "몇 mL가 남았는지 구하는 것"],
    중: ["남은 양", "마신 후 남은 우유"],
    하: ["1L", "250mL"],
  },
  "2-1": {
    상: ["1000 - 250 - 300", "전체에서 마신 양을 뺀다."],
    중: ["1000-250-300", "빼기를 한다."],
    하: ["1000 + 250 + 300", "250 × 300"],
  },
  "2-2": {
    상: ["남은 양을 구하려면 전체에서 마신 양의 합을 빼야 하기 때문이다."],
    중: ["전체에서 마신 만큼 뺀다.", "남은 양은 빼기로 구한다."],
    하: ["더하면 남는다.", "나누면 남는다."],
  },
  "3-1": {
    상: ["1000mL", "1L = 1000mL"],
    중: ["1000", "리터를 밀리리터로 바꾼다."],
    하: ["1mL", "100mL"],
  },
  "3-2": {
    상: ["$$1000 - 250 - 300$$", "$1000 - 250 - 300$"],
    중: ["1000-250-300", "1000에서 빼기"],
    하: ["1000 + 250 + 300", "250 × 300"],
  },
  "4-1": {
    상: ["450", "450mL"],
    중: ["400", "500"],
    하: ["750", "250"],
  },
  "4-2": {
    상: ["450mL", "450mL가 남는다."],
    중: ["450", "약 450mL"],
    하: ["550mL", "350mL"],
  },
};

export const DEMO_SIMULATION_EXAMPLES_EXAMPLE1_EN: DemoSimulationExamples = {
  "1-1": {
    상: ["The storybook has 314 pages.\nMike reads 23 pages each day."],
    중: ["314 pages and 23 pages per day.", "Mike reads the book daily."],
    하: ["Mike reads a book.", "314 and 23 appear."],
  },
  "1-2": {
    상: ["The number of days to finish the book"],
    중: ["How many days", "Days to finish"],
    하: ["Pages per day", "314 ÷ 23"],
  },
  "2-1": {
    상: ["314 ÷ 23"],
    중: ["Divide 314 by 23"],
    하: ["314 + 23", "314 × 23"],
  },
  "2-2": {
    상: ["The quotient is full days; the remainder is pages for one more day."],
    중: ["Quotient is days; remainder is leftover pages."],
    하: ["Add quotient and remainder.", "Use only the quotient."],
  },
  "3-1": {
    상: ["Add 1 day to the quotient."],
    중: ["One more day if remainder exists."],
    하: ["Ignore the remainder."],
  },
  "3-2": {
    상: ["$$314 \\div 23$$"],
    중: ["314/23"],
    하: ["314 × 23"],
  },
  "4-1": {
    상: ["$13 \\ldots 15$"],
    중: ["13"],
    하: ["14"],
  },
  "4-2": {
    상: ["14 days"],
    중: ["about 14 days"],
    하: ["13 days"],
  },
};

export const DEMO_SIMULATION_EXAMPLES_EXAMPLE4_EN: DemoSimulationExamples = {
  "1-1": {
    상: ["There is 1 L (1000 mL) of milk.\nJack drank 250 mL.\nHarry drank 300 mL."],
    중: ["1 L of milk; two people drank some."],
    하: ["Milk and milliliters."],
  },
  "1-2": {
    상: ["The amount of milk left in milliliters"],
    중: ["How much is left"],
    하: ["1 L"],
  },
  "2-1": {
    상: ["1000 - 250 - 300"],
    중: ["Subtract from 1000"],
    하: ["1000 + 250 + 300"],
  },
  "2-2": {
    상: ["To find what remains after both people drank."],
    중: ["Subtract amounts drunk from total."],
    하: ["Add the amounts."],
  },
  "3-1": {
    상: ["1000 mL"],
    중: ["Convert liters to milliliters."],
    하: ["1 mL"],
  },
  "3-2": {
    상: ["$$1000 - 250 - 300$$"],
    중: ["1000-250-300"],
    하: ["1000+250+300"],
  },
  "4-1": {
    상: ["450"],
    중: ["400"],
    하: ["750"],
  },
  "4-2": {
    상: ["450 mL"],
    중: ["about 450 mL"],
    하: ["550 mL"],
  },
};

export function getDemoSimulationExamples(key: DemoProblemKey): DemoSimulationExamples {
  switch (key) {
    case "example4":
      return DEMO_SIMULATION_EXAMPLES_EXAMPLE4;
    case "example1-en":
      return DEMO_SIMULATION_EXAMPLES_EXAMPLE1_EN;
    case "example4-en":
      return DEMO_SIMULATION_EXAMPLES_EXAMPLE4_EN;
    case "example1":
      return DEMO_SIMULATION_EXAMPLES;
    default:
      return {};
  }
}
