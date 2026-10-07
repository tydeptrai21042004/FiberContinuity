import { useState } from "react";

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  autoComplete?: string;
  hint?: string;
}

export default function PasswordField({ value, onChange, label = "Recovery password", autoComplete = "current-password", hint }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const remaining = Math.max(0, 12 - value.length);
  return (
    <label className="field password-field">
      <span>
        {label}
        <em>{hint ?? (remaining === 0 ? "minimum met" : `${remaining} more character${remaining === 1 ? "" : "s"}`)}</em>
      </span>
      <span className="input-action-wrap">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          minLength={12}
          autoComplete={autoComplete}
          spellCheck={false}
        />
        <button className="input-action" type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Hide recovery password" : "Show recovery password"}>
          {visible ? "Hide" : "Show"}
        </button>
      </span>
    </label>
  );
}
