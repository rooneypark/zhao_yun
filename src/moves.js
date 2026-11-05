// 게임 데이터: 기술, 유닛, 스테이지, 대사.
// 좌표 단위는 미터. x 오른쪽, y 화면 아래(안쪽) 방향의 바닥 평면.

// t0~t1 사이 step 간격으로 같은 타격을 반복
function multi(t0, t1, step, hit) {
  const out = [];
  for (let t = t0; t <= t1 + 1e-6; t += step) out.push({ ...hit, t: +t.toFixed(3) });
  return out;
}

const line = (len, w) => ({ type: 'line', len, w });
const sector = (r, a) => ({ type: 'sector', r, a });
const circle = (r, off = 0) => ({ type: 'circle', r, off });

// ---------------------------------------------------------------- 조운
// anim: 무기 연출 종류. lunge: [시작, 끝, 속도] 동안 전진. cancel: 다음 입력 허용 시점.
// hit: t 시각에 shape 판정. react: flinch | knock | launch | stun. kb: 밀림 속도. lift: 띄우기 속도.
export const ZY_MOVES = {
  N1: { anim: 'thrust', dur: 0.34, cancel: 0.18, lunge: [0.03, 0.13, 7],
    hits: [{ t: 0.11, shape: line(3.0, 1.3), dmg: 10, react: 'flinch', kb: 3, fx: 'thrust' }] },
  N2: { anim: 'slash', dir: 1, dur: 0.36, cancel: 0.2, lunge: [0.03, 0.13, 5],
    hits: [{ t: 0.13, shape: sector(2.8, 140), dmg: 10, react: 'flinch', kb: 3, fx: 'slash' }] },
  N3: { anim: 'thrust', dur: 0.42, cancel: 0.27, lunge: [0.03, 0.2, 6],
    hits: [{ t: 0.11, shape: line(3.2, 1.3), dmg: 8, react: 'flinch', kb: 2, fx: 'thrust' },
      { t: 0.21, shape: line(3.2, 1.3), dmg: 8, react: 'flinch', kb: 3, fx: 'thrust' }] },
  N4: { anim: 'slash', dir: -1, dur: 0.4, cancel: 0.24, lunge: [0.03, 0.14, 6],
    hits: [{ t: 0.14, shape: sector(3.0, 160), dmg: 12, react: 'flinch', kb: 4, fx: 'slash' }] },
  N5: { anim: 'thrust', dur: 0.48, cancel: 0.32, lunge: [0.03, 0.3, 5],
    hits: multi(0.09, 0.3, 0.07, { shape: line(3.4, 1.4), dmg: 7, react: 'flinch', kb: 2, fx: 'thrust' }) },
  N6: { anim: 'spin', dur: 0.62, cancel: 0.48, lunge: [0.05, 0.25, 5],
    hits: [{ t: 0.26, shape: circle(3.4), dmg: 22, react: 'knock', kb: 11, stop: 0.09, shake: 7, fx: 'spin', gain: 4 }] },

  // 차지: C1은 대기에서 바로, Cn은 N(n-1) 뒤에
  C1: { name: '용승창', anim: 'up', dur: 0.6, cancel: 0.42, lunge: [0.05, 0.16, 6],
    hits: [{ t: 0.17, shape: sector(2.8, 100), dmg: 16, react: 'launch', lift: 9, kb: 1, stop: 0.07, shake: 4, fx: 'up' }] },
  C2: { name: '관통돌', anim: 'dash', dur: 0.56, cancel: 0.44, lunge: [0.05, 0.36, 17], superArmor: true,
    hits: multi(0.08, 0.36, 0.07, { shape: line(2.2, 1.8), dmg: 9, react: 'knock', kb: 7, fx: 'thrust' }) },
  C3: { name: '천룡무', anim: 'up', dur: 0.85, cancel: 0.66, lunge: [0.05, 0.15, 5], superArmor: true,
    hits: [{ t: 0.15, shape: sector(2.8, 110), dmg: 12, react: 'launch', lift: 9, kb: 1, fx: 'up', stop: 0.06 },
      ...multi(0.36, 0.6, 0.12, { shape: circle(2.8, 0.8), dmg: 8, react: 'launch', lift: 4.5, kb: 0.5, fx: 'spin' })] },
  C4: { name: '진천격', anim: 'slam', dur: 0.82, cancel: 0.62, superArmor: true,
    hits: [{ t: 0.34, shape: circle(3.8, 1.2), dmg: 24, react: 'stun', stun: 1.8, kb: 2, stop: 0.1, shake: 10, fx: 'ring', gain: 4 }] },
  C5: { name: '선풍창', anim: 'spin', dur: 1.0, cancel: 0.82, steer: 3.5, superArmor: true,
    hits: [...multi(0.1, 0.6, 0.1, { shape: circle(3.3), dmg: 7, react: 'flinch', kb: 2, fx: 'spin' }),
      { t: 0.76, shape: circle(3.6), dmg: 18, react: 'knock', kb: 10, stop: 0.08, shake: 6, fx: 'spin' }] },
  C6: { name: '창룡돌파', anim: 'dash', dur: 1.12, cancel: 0.95, lunge: [0.1, 0.62, 14], superArmor: true,
    hits: [...multi(0.12, 0.6, 0.06, { shape: line(2.4, 2.0), dmg: 8, react: 'knock', kb: 6, fx: 'thrust' }),
      { t: 0.8, shape: circle(4.6, 1.0), dmg: 36, react: 'knock', kb: 13, lift: 6, stop: 0.12, shake: 12, fx: 'burst', gain: 6 }] },

  // 쿨타임 스킬
  SK1: { name: '용아돌', anim: 'dash', dur: 0.5, cancel: 0.42, lunge: [0.0, 0.3, 24], iframes: [0, 0.32],
    hits: [...multi(0.03, 0.3, 0.05, { shape: line(2.4, 2.2), dmg: 12, react: 'knock', kb: 8, fx: 'thrust' }),
      { t: 0.34, shape: circle(3.2, 0.8), dmg: 20, react: 'launch', lift: 8, kb: 3, stop: 0.08, shake: 6, fx: 'ring' }] },
  SK2: { name: '창룡선풍', anim: 'spin', dur: 1.35, cancel: 1.2, superArmor: true, steer: 2,
    hits: [{ t: 0.05, pull: 8, shape: circle(8), dmg: 0, react: 'none', fx: 'ring' },
      ...multi(0.2, 1.0, 0.1, { shape: circle(3.8), dmg: 8, react: 'flinch', kb: -1, fx: 'spin' }),
      { t: 1.15, shape: circle(4.2), dmg: 26, react: 'launch', lift: 10, kb: 4, stop: 0.1, shake: 9, fx: 'burst' }] },
};

export const ZY_SKILLS = {
  sk1: { move: 'SK1', cd: 7, label: '용아돌', key: 'U' },
  sk2: { move: 'SK2', cd: 14, label: '창룡선풍', key: 'O' },
};

// 난무: 지속 시간 동안 tick 간격으로 타격, 끝에 마무리
export const RAMPAGE = {
  dur: 3.4, tick: 0.08, finishAt: 3.0, steer: 5,
  tickHit: { shape: sector(3.8, 170), dmg: 9, react: 'flinch', kb: 2.5, stop: 0, gain: 0, fx: 'slash' },
  finish: { shape: circle(6.5), dmg: 60, react: 'knock', kb: 15, lift: 7, stop: 0.14, shake: 16, fx: 'burst', gain: 0 },
};
