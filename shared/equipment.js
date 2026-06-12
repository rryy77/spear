/** 装備カタログ */
const EQUIPMENT = {
  horses: {
    swift: { id: 'swift', name: '駿馬', speed: 1.05, defense: 1.0 },
    war: { id: 'war', name: '軍馬', speed: 1.0, defense: 1.1 },
    heavy: { id: 'heavy', name: '重馬', speed: 0.95, defense: 1.2 },
  },
  lances: {
    standard: { id: 'standard', name: '標準槍', damage: 1.0, reach: 1.0 },
    long: { id: 'long', name: '長槍', damage: 0.95, reach: 1.15 },
    heavy: { id: 'heavy', name: '重槍', damage: 1.2, reach: 0.9 },
  },
  armors: {
    chain: { id: 'chain', name: '鎖帷子', reduction: 1.0 },
    plate: { id: 'plate', name: '板金鎧', reduction: 0.85 },
    royal: { id: 'royal', name: '王家鎧', reduction: 0.75 },
  },
  shields: {
    buckler: { id: 'buckler', name: '小盾', block: 1.0 },
    kite: { id: 'kite', name: 'カイト盾', block: 1.15 },
    tower: { id: 'tower', name: '塔盾', block: 1.25 },
  },
};

const DEFAULT_EQUIPMENT = {
  horse: 'war',
  lance: 'standard',
  armor: 'chain',
  shield: 'buckler',
};

function getEquipItem(category, id) {
  return EQUIPMENT[category]?.[id] || EQUIPMENT[category][Object.keys(EQUIPMENT[category])[0]];
}

const JoustEquipment = { EQUIPMENT, DEFAULT_EQUIPMENT, getEquipItem };
if (typeof module !== 'undefined') module.exports = JoustEquipment;
else if (typeof globalThis !== 'undefined') globalThis.JoustEquipment = JoustEquipment;
