interface QRCodeArtProps {
  seed: string;
  size?: number;
}

export function QRCodeArt({ seed, size = 160 }: QRCodeArtProps) {
  const gridSize = 21;
  const cellSize = size / gridSize;

  const cells: boolean[][] = [];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }

  for (let r = 0; r < gridSize; r++) {
    cells[r] = [];
    for (let c = 0; c < gridSize; c++) {
      hash = (hash * 1103515245 + 12345) & 0x7fffffff;
      cells[r][c] = (hash & 1) === 1;
    }
  }

  const isFinder = (r: number, c: number): boolean => {
    const inCorner =
      (r < 7 && c < 7) ||
      (r < 7 && c >= gridSize - 7) ||
      (r >= gridSize - 7 && c < 7);
    if (!inCorner) return false;

    let lr = r;
    let lc = c;
    if (r >= gridSize - 7) lr = r - (gridSize - 7);
    if (c >= gridSize - 7) lc = c - (gridSize - 7);

    const onOuter = lr === 0 || lr === 6 || lc === 0 || lc === 6;
    const onInner = lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
    return onOuter || onInner;
  };

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (isFinder(r, c)) cells[r][c] = true;
    }
  }

  return (
    <div
      className="relative bg-white p-3 rounded-xl shadow-inner border border-gray-200"
      style={{ width: size + 24, height: size + 24 }}
    >
      <div
        className="grid bg-white"
        style={{
          gridTemplateColumns: `repeat(${gridSize}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${gridSize}, ${cellSize}px)`,
          width: size,
          height: size,
        }}
      >
        {cells.flatMap((row, r) =>
          row.map((filled, c) => (
            <div
              key={`${r}-${c}`}
              className={filled ? "bg-gray-900" : "bg-white"}
            />
          ))
        )}
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="bg-primary-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
          RF
        </div>
      </div>
    </div>
  );
}
