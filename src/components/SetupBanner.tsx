export function SetupBanner() {
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
    </div>
  )
}
