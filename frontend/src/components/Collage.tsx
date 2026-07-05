// Коллаж из 1–5 фото с красивой раскладкой по количеству.
interface Props {
  photos: string[];
  onOpen: (index: number) => void;
}

export default function Collage({ photos, onOpen }: Props) {
  const list = photos.slice(0, 5);
  const n = list.length;
  if (n === 0) return null;

  return (
    <div className={`collage n${n}`}>
      {list.map((src, i) => (
        <div className="cell" key={i} onClick={() => onOpen(i)}>
          <img src={src} alt="" loading="lazy" />
        </div>
      ))}
    </div>
  );
}
