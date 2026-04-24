type StatusMessagesProps = {
  loading?: boolean;
  loadingText?: string;
  error?: string | null;
  success?: string | null;
};

export function StatusMessages({
  loading = false,
  loadingText = "Loading...",
  error = null,
  success = null,
}: StatusMessagesProps) {
  return (
    <>
      {loading && <p className="muted">{loadingText}</p>}
      {error && <p className="text-danger">{error}</p>}
      {success && <p className="text-ok">{success}</p>}
    </>
  );
}
