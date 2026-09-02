export function SetupBanner({ onReplay }: { onReplay: () => void }) {
  return (
    <div className="banner">
      <b>No agent attached yet.</b> Everything below works by hand, but the point of Tandem is the other half.
      <ol>
        <li>Open this page in <b>ChatGPT’s in-app browser</b>, or</li>
        <li>
          in Chrome, enable <code>chrome://flags/#enable-webmcp-testing</code>, relaunch, and reload this page.
        </li>
        <li>Then ask your agent: <i>“What am I weakest at, and drill me on it.”</i></li>
      </ol>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn sm primary" onClick={onReplay}>
          Watch a 40 second replay
        </button>
        <span className="hint">
          Runs the same tool calls an agent would make, against this workspace. Restores the sample decks first.
        </span>
      </div>
    </div>
  )
}
