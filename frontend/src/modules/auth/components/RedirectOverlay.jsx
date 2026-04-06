export default function RedirectOverlay({ name }) {
  return (
    <div className="redirect-overlay">
      <div className="redirect-box">
        <div className="redirect-icon">🎉</div>
        <div className="redirect-name">Welcome{name ? `, ${name}` : ''}!</div>
        <div className="redirect-msg">Finding the best buses for you...</div>
        <div className="redirect-progress">
          <div className="redirect-bar" />
        </div>
      </div>
    </div>
  );
}
