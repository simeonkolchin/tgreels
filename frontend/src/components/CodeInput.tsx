import { useEffect, useRef, useState } from 'react';

interface Props {
  onChange: (v: string) => void;
  length?: number;
}

// Пять квадратиков для кода: авто-переход, backspace, вставка.
export default function CodeInput({ onChange, length = 5 }: Props) {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  // сброс значения у родителя при появлении
  useEffect(() => {
    onChange('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = (arr: string[]) => {
    setDigits(arr);
    onChange(arr.join(''));
  };

  const onInput = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, '').slice(-1);
    const arr = [...digits];
    arr[i] = d;
    emit(arr);
    if (d && i < length - 1) refs.current[i + 1]?.focus();
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const arr = [...digits];
      if (arr[i]) {
        arr[i] = '';
        emit(arr);
      } else if (i > 0) {
        arr[i - 1] = '';
        emit(arr);
        refs.current[i - 1]?.focus();
      }
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!t) return;
    e.preventDefault();
    const arr = Array(length)
      .fill('')
      .map((_, k) => t[k] || '');
    emit(arr);
    refs.current[Math.min(t.length, length - 1)]?.focus();
  };

  return (
    <div className="code-boxes">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          className="code-box"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={onPaste}
        />
      ))}
    </div>
  );
}
