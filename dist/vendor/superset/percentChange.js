export function rebaseToPercentChange(records, xAxis) {
    const baselines = {};
    records.forEach((record)=>{
        Object.entries(record).forEach(([key, value])=>{
            if (key !== xAxis && !(key in baselines) && typeof value === 'number' && !Number.isNaN(value)) {
                baselines[key] = value;
            }
        });
    });
    return records.map((record)=>{
        const rebased = {
            [xAxis]: record[xAxis]
        };
        Object.entries(record).forEach(([key, value])=>{
            if (key === xAxis) return;
            const baseline = baselines[key];
            rebased[key] = typeof value === 'number' && !Number.isNaN(value) && baseline !== undefined && baseline !== 0 ? value / baseline - 1 : null;
        });
        return rebased;
    });
}
export function rebaseSeriesData(data, baselineX) {
    let baselineValue = null;
    data.forEach(([x, y])=>{
        if (y == null) return;
        if (x <= baselineX || baselineValue === null) {
            baselineValue = y;
        }
    });
    if (baselineValue === null || baselineValue === -1) {
        return data.map(([x])=>[
                x,
                null
            ]);
    }
    const divisor = 1 + baselineValue;
    return data.map(([x, y])=>[
            x,
            y == null ? null : (1 + y) / divisor - 1
        ]);
}
export function snapToNearestX(xs, target) {
    if (xs.length === 0) return undefined;
    if (typeof target === 'string') {
        return xs.includes(target) ? target : xs[0];
    }
    const numericXs = xs.filter((x)=>typeof x === 'number');
    if (numericXs.length === 0) return undefined;
    return numericXs.reduce((best, x)=>Math.abs(x - target) < Math.abs(best - target) ? x : best);
}
