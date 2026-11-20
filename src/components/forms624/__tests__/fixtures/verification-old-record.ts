/**
 * A record exactly as it was stored before per-item limits existed (instructions v1.0): the snapshots carry
 * no unit, test weight or tolerance. The two .html files next to this one were produced from this record by
 * the code of commit 7a72978 (the last one before the change) and must keep coming out identical.
 */
export const OLD_RECORD = {
  period: "2026-11-A",
  status: "submitted",
  conductedBy: "Hugo Ayala",
  initials: "HGA",
  listVersion: 1,
  okCount: 3,
  failCount: 2,
  notInUseCount: 1,
  notes: "Old record",
  submittedAt: "2026-11-14T22:30:00.000Z",
  items: [
    { equipmentId: "p1", section: "portable_thermometer", name: "Dial Probe Thermometer", location: "", inUse: true, position: 1, result: "OK", correctiveAction: "", notes: "", checkedAt: "2026-11-14T22:05:00.000Z", reading: 32, recheck: null },
    { equipmentId: "p2", section: "portable_thermometer", name: "Dial Oven Thermometer", location: "", inUse: true, position: 2, result: "NOT_OK", correctiveAction: "Recalibrated the dial", notes: "Dial was loose", checkedAt: "2026-11-14T22:06:00.000Z", reading: 36, recheck: 32.2 },
    { equipmentId: "p3", section: "portable_thermometer", name: "Dial Oven Thermometer #2", location: "", inUse: false, position: 3, result: null, correctiveAction: "", notes: "", checkedAt: null },
    { equipmentId: "f1", section: "fixed_thermometer", name: "Cold Room Thermometer", location: "", inUse: true, position: 1, result: "OK", correctiveAction: "", notes: "", checkedAt: "2026-11-14T22:10:00.000Z", referenceId: "p1", referenceName: "Dial Probe Thermometer", target: 38, fixedReading: 39.5 },
    { equipmentId: "s1", section: "scale", name: "Digital Scale", location: "624 Garrison", inUse: true, position: 1, result: "OK", correctiveAction: "", notes: "", checkedAt: "2026-11-14T22:15:00.000Z", points: [1.1, 1.1, 1.1, 1, 1.2], pointResults: ["OK", "OK", "OK", "OK", "OK"] },
    { equipmentId: "s2", section: "scale", name: "Platform Dial Scale", location: "624 Garrison", inUse: true, position: 2, result: "NOT_OK", correctiveAction: "Levelled the scale", notes: "", checkedAt: "2026-11-14T22:20:00.000Z", points: [1.1, 1.1, 1.25, 1.1, 1.1], pointResults: ["OK", "OK", "NOT_OK", "OK", "OK"] },
    { kind: "header", date: "2026-11-14", time: "14:05" },
  ],
};
