export class FingerTracker {
  private dot: HTMLElement;
  private isVisible: boolean = false;

  constructor() {
    this.dot = this.createDot();
    document.body.appendChild(this.dot);
  }

  private createDot(): HTMLElement {
    const dot = document.createElement("div");
    dot.id = "fingertip-tracker-dot";
    dot.style.position = "fixed";
    dot.style.width = "12px";
    dot.style.height = "12px";
    dot.style.backgroundColor = "#ff0000";
    dot.style.borderRadius = "50%";
    dot.style.pointerEvents = "none";
    dot.style.zIndex = "99999";
    dot.style.display = "none";
    dot.style.boxShadow = "0 0 15px rgba(255, 0, 0, 0.9)";
    dot.style.transform = "translate(-50%, -50%)";

    return dot;
  }

  updatePosition(x: number, y: number): void {
    this.dot.style.left = `${x}px`;
    this.dot.style.top = `${y}px`;

    if (!this.isVisible) {
      this.dot.style.display = "block";
      this.isVisible = true;
    }
  }

  hide(): void {
    this.dot.style.display = "none";
    this.isVisible = false;
  }

  destroy(): void {
    if (this.dot.parentElement) {
      this.dot.parentElement.removeChild(this.dot);
    }
  }
}
