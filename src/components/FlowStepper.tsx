interface FlowStep {
  label: string;
  detail?: string;
  state: "done" | "active" | "pending" | "blocked";
}

export default function FlowStepper({ steps, ariaLabel }: { steps: FlowStep[]; ariaLabel: string }) {
  return (
    <ol className="flow-stepper" aria-label={ariaLabel}>
      {steps.map((step, index) => (
        <li className={`flow-step ${step.state}`} key={`${index}-${step.label}`} aria-current={step.state === "active" ? "step" : undefined}>
          <span className="flow-index" aria-hidden="true">{step.state === "done" ? "✓" : String(index + 1).padStart(2, "0")}</span>
          <span className="flow-copy"><strong>{step.label}</strong>{step.detail && <small>{step.detail}</small>}</span>
        </li>
      ))}
    </ol>
  );
}
