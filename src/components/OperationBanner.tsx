export type OperationNotice = {
  kind: "idle" | "working" | "success" | "warning" | "error";
  title: string;
  detail?: string;
};

export default function OperationBanner({ notice }: { notice: OperationNotice }) {
  const critical = notice.kind === "error";
  return (
    <div className={`operation-banner ${notice.kind}`} role={critical ? "alert" : "status"} aria-live={critical ? "assertive" : "polite"}>
      <span className="operation-dot" aria-hidden="true" />
      <div>
        <strong>{notice.title}</strong>
        {notice.detail && <p>{notice.detail}</p>}
      </div>
    </div>
  );
}
