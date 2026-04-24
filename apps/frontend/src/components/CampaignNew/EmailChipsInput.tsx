import { useRef, useState, type KeyboardEvent, type ClipboardEvent } from "react";
import { cn } from "@/lib/utils";
import { EmailChip } from "./EmailChip";

export interface EmailChipsInputProps {
  emails: string[];
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  maxHeightClassName?: string;
  onChange: (emails: string[]) => void;
  validateEmail?: (email: string) => boolean;
}

const DEFAULT_SEPARATOR = /[\s,;]+/;

const COMMIT_KEYS = new Set(["Enter", " ", ",", ";"]);

function defaultValidateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function EmailChipsInput({
  emails,
  placeholder,
  invalid = false,
  disabled = false,
  maxHeightClassName = "max-h-40",
  onChange,
  validateEmail = defaultValidateEmail,
}: EmailChipsInputProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commitDraft = (raw: string): boolean => {
    const tokens = raw
      .split(DEFAULT_SEPARATOR)
      .map((t) => t.trim())
      .filter(Boolean);

    if (tokens.length === 0) {
      return false;
    }

    const existing = new Set(emails);
    const next = [...emails];

    for (const token of tokens) {
      if (!existing.has(token)) {
        next.push(token);
        existing.add(token);
      }
    }

    if (next.length !== emails.length) {
      onChange(next);
    }

    return true;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (COMMIT_KEYS.has(event.key)) {
      if (draft.trim().length === 0) {
        if (event.key === "Enter") {
          event.preventDefault();
        }

        return;
      }

      event.preventDefault();
      commitDraft(draft);
      setDraft("");

      return;
    }

    if (event.key === "Backspace" && draft.length === 0 && emails.length > 0) {
      event.preventDefault();
      onChange(emails.slice(0, -1));
    }
  };

  const handleBlur = () => {
    if (draft.trim().length > 0) {
      commitDraft(draft);
      setDraft("");
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text");

    if (!DEFAULT_SEPARATOR.test(pasted)) {
      return;
    }

    event.preventDefault();
    commitDraft(`${draft} ${pasted}`);
    setDraft("");
  };

  const handleRemove = (index: number) => {
    const next = emails.filter((_, i) => i !== index);
    onChange(next);
    inputRef.current?.focus();
  };

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  return (
    <div
      role="group"
      aria-label="Email recipients"
      onClick={handleContainerClick}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      className={cn(
        "flex w-full flex-wrap items-center gap-1.5 overflow-y-auto rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm transition-colors",
        "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        "data-[invalid]:border-destructive data-[invalid]:focus-within:ring-destructive/20",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "min-h-10",
        maxHeightClassName,
      )}
    >
      {emails.map((email, index) => (
        <EmailChip
          key={`${email}-${index}`}
          email={email}
          invalid={!validateEmail(email)}
          onRemove={() => handleRemove(index)}
        />
      ))}
      <input
        ref={inputRef}
        type="text"
        value={draft}
        disabled={disabled}
        placeholder={emails.length === 0 ? placeholder : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onPaste={handlePaste}
        size={Math.max(draft.length + 1, emails.length === 0 ? 30 : 8)}
        className="min-w-[8ch] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
