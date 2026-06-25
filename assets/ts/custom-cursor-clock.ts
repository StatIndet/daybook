// @ts-nocheck
export class IdleClockController {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rafId: number | null = null;
  
  private state: 'hidden' | 'entering' | 'active' | 'exiting' | 'snapped' = 'hidden';

  private width: number = 0;
  private height: number = 0;

  private cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  // Physics & Animation Arrays
  private dy = new Float64Array(200);
  private dx = new Float64Array(200);
  private zy = new Float64Array(200);
  private zx = new Float64Array(200);
  
  private pscale = new Float64Array(200);
  private popacity = new Float64Array(200);
  private pradiusOffset = new Float64Array(200);
  private pdx = new Float64Array(200);
  private pdy = new Float64Array(200);
  private vx = new Float64Array(200);
  private vy = new Float64Array(200);

  private sum: number = 0;

  private theDays = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  private theMonths = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

  private dateInWords: string[] = [];
  private clockNumbers = ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "1", "2"];
  private hourHand = ["•", "•", "•"];
  private minuteHand = ["•", "•", "•", "•"];
  private secondHand = ["•", "•", "•", "•", "•"];

  private F = this.clockNumbers.length;
  private siz = 70; // Increased size for new hand geometry
  private eqf = 360 / this.F;
  private eqd: number = 0;
  private han = 12; // Fixed 12px gap between 8px dots

  private colors = {
    main: "",
    text: "",
    muted: ""
  };

  private lastDateString = "";

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "daybook-cursor-clock";
    this.canvas.setAttribute("aria-hidden", "true");
    this.ctx = this.canvas.getContext("2d")!;
    
    document.body.appendChild(this.canvas);
    
    this.sum = this.dateInWords.length + this.F + this.hourHand.length + this.minuteHand.length + this.secondHand.length + 1;
    for (let i = 0; i < 200; i++) {
      this.dy[i] = 0;
      this.dx[i] = 0;
      this.zy[i] = 0;
      this.zx[i] = 0;
      this.pscale[i] = 0;
      this.popacity[i] = 0;
      this.pradiusOffset[i] = -15;
      this.vx[i] = 0;
      this.vy[i] = 0;
    }

    this.onResize();
    window.addEventListener("resize", () => this.onResize(), { passive: true });
    this.updateDateWords();
  }

  private onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  public updateColors() {
    const computed = getComputedStyle(document.body);
    this.colors.main = computed.getPropertyValue("--color-accent").trim() || "blue";
    this.colors.text = computed.getPropertyValue("--color-text").trim() || "black";
    this.colors.muted = computed.getPropertyValue("--color-muted").trim() || "gray";
  }

  private updateDateWords() {
    const date = new Date();
    const day = date.getDate();
    const year = date.getFullYear();
    const newDateString = ` ${this.theDays[date.getDay()]} ${this.theMonths[date.getMonth()]} ${day} ${year} `;
    
    if (newDateString !== this.lastDateString) {
      this.lastDateString = newDateString;
      this.dateInWords = newDateString.split("");
      this.eqd = 360 / this.dateInWords.length;
      this.sum = this.dateInWords.length + this.F + this.hourHand.length + this.minuteHand.length + this.secondHand.length + 1;
    }
  }

  public updateTarget(x: number, y: number) {
    this.cursor.x = x;
    this.cursor.y = y;
  }

  public start(x: number, y: number) {
    if (this.state === 'entering' || this.state === 'active') return;
    this.updateTarget(x, y);
    
    // Reset inertia array to (0, 0) for the original whip effect
    if (this.state === 'hidden' || this.state === 'snapped') {
      for (let i = 0; i < this.sum; i++) {
        this.dx[i] = 0;
        this.dy[i] = 0;
        this.pdx[i] = 0;
        this.pdy[i] = 0;
        this.zx[i] = 0;
        this.zy[i] = 0;
        this.pscale[i] = 1;
        this.popacity[i] = 0;
        this.pradiusOffset[i] = 0;
      }
    }

    this.updateColors();
    this.updateDateWords();
    this.canvas.classList.add("is-visible");
    this.state = 'entering';

    if (!this.rafId) {
      this.loop();
    }
  }

  public stop() {
    if (this.state === 'hidden' || this.state === 'exiting' || this.state === 'snapped') return;
    this.state = 'exiting';
  }

  public snap() {
    if (this.state === 'hidden' || this.state === 'snapped') return;
    this.state = 'snapped';
    
    // Inherit real momentum from the previous frame for true inertia
    for (let i = 0; i < this.sum; i++) {
      this.vx[i] = this.dx[i] - this.pdx[i];
      this.vy[i] = this.dy[i] - this.pdy[i];
    }
  }

  private loop() {
    let allDone = true;

    if (this.state === 'entering') {
      for (let i = 0; i < this.sum; i++) {
        this.popacity[i] += (1 - this.popacity[i]) * 0.3;
      }
      
      // Keep physics running until the last particle catches up
      if (Math.abs(this.dy[this.sum - 1] - this.cursor.y) < 2) {
        allDone = true;
      } else {
        allDone = false;
      }
      if (allDone) this.state = 'active';
    } else if (this.state === 'exiting') {
      for (let i = 0; i < this.sum; i++) {
        // Reverse sequential scale fade out
        if (i === this.sum - 1 || this.pscale[i + 1] < 0.8) {
          this.pscale[i] += (0 - this.pscale[i]) * 0.08;
          this.popacity[i] += (0 - this.popacity[i]) * 0.08;
        }
        if (this.pscale[i] > 0.01) allDone = false;
      }
      if (allDone) {
        this.state = 'hidden';
        this.canvas.classList.remove("is-visible");
      }
    } else if (this.state === 'snapped') {
      for (let i = 0; i < this.sum; i++) {
        // True inertia sliding with air friction
        this.dx[i] += this.vx[i];
        this.dy[i] += this.vy[i];
        this.vx[i] *= 0.96;
        this.vy[i] *= 0.96;
        
        this.popacity[i] -= 0.01; // fade out in ~100 frames (1.6s)
        if (this.popacity[i]! > 0) allDone = false;
        else this.popacity[i] = 0;
      }
      if (allDone) {
        this.state = 'hidden';
        this.canvas.classList.remove("is-visible");
      }
    } else if (this.state === 'active') {
      allDone = false; // keep running
    }

    if (this.state === 'hidden') {
      this.rafId = null;
      this.ctx.clearRect(0, 0, this.width, this.height);
      return;
    }

    if (this.state !== 'snapped') {
      this.updatePositions();
    }
    
    this.draw();
    this.rafId = requestAnimationFrame(() => this.loop());
  }

  private updatePositions() {
    const del = 0.4;
    
    // Save previous frame state for momentum calculation
    for (let i = 0; i < this.sum; i++) {
      this.pdx[i] = this.dx[i];
      this.pdy[i] = this.dy[i];
    }
    
    this.zy[0] = this.dy[0] += (this.cursor.y - this.dy[0]) * del;
    this.zx[0] = this.dx[0] += (this.cursor.x - this.dx[0]) * del;
    
    for (let i = 1; i < this.sum; i++) {
      this.zy[i] = this.dy[i] += (this.zy[i - 1] - this.dy[i]) * del;
      this.zx[i] = this.dx[i] += (this.zx[i - 1] - this.dx[i]) * del;
    }
  }

  private drawParticle(idx: number, x: number, y: number, text: string, color: string) {
    if (this.popacity[idx]! <= 0) return;
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.scale(this.pscale[idx]!, this.pscale[idx]!);
    this.ctx.globalAlpha = this.popacity[idx]!;
    this.ctx.fillStyle = color;
    
    if (text === "•") {
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 4, 0, Math.PI * 2);
      this.ctx.fill();
    } else {
      this.ctx.fillText(text, 0, 0);
    }
    
    this.ctx.restore();
  }

  private draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    
    const time = new Date();
    const secs = time.getSeconds();
    const sec = (Math.PI * (secs - 15)) / 30;
    const mins = time.getMinutes();
    const min = (Math.PI * (mins - 15)) / 30;
    const hrs = time.getHours();
    const hr = (Math.PI * (hrs - 3)) / 6 + (Math.PI * time.getMinutes()) / 360;

    // Increased font size to balance the larger geometric hand dots
    this.ctx.font = "bold 14px sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    // 1. Date
    for (let i = 0; i < this.dateInWords.length; i++) {
      const rad = this.siz * 1.5 + this.pradiusOffset[i];
      const y = this.dy[i] + rad * Math.sin(-sec + (i * this.eqd * Math.PI) / 180);
      const x = this.dx[i] + rad * Math.cos(-sec + (i * this.eqd * Math.PI) / 180);
      this.drawParticle(i, x, y, this.dateInWords[i]!, this.colors.muted);
    }

    // 2. Face (Numbers)
    for (let i = 0; i < this.clockNumbers.length; i++) {
      const idx = this.dateInWords.length + i;
      const rad = this.siz + this.pradiusOffset[idx];
      const y = this.dy[idx] + rad * Math.sin((i * this.eqf * Math.PI) / 180);
      const x = this.dx[idx] + rad * Math.cos((i * this.eqf * Math.PI) / 180);
      this.drawParticle(idx, x, y, this.clockNumbers[i]!, this.colors.text);
    }

    // 3. Hours
    for (let i = 0; i < this.hourHand.length; i++) {
      const idx = this.dateInWords.length + this.F + i;
      const rad = i * this.han + this.pradiusOffset[idx];
      const y = this.dy[idx] + rad * Math.sin(hr);
      const x = this.dx[idx] + rad * Math.cos(hr);
      this.drawParticle(idx, x, y, this.hourHand[i]!, this.colors.text);
    }

    // 4. Minutes
    for (let i = 0; i < this.minuteHand.length; i++) {
      const idx = this.dateInWords.length + this.F + this.hourHand.length + i;
      const rad = i * this.han + this.pradiusOffset[idx];
      const y = this.dy[idx] + rad * Math.sin(min);
      const x = this.dx[idx] + rad * Math.cos(min);
      this.drawParticle(idx, x, y, this.minuteHand[i]!, this.colors.text);
    }

    // 5. Seconds
    for (let i = 0; i < this.secondHand.length; i++) {
      const idx = this.dateInWords.length + this.F + this.hourHand.length + this.minuteHand.length + i;
      const rad = i * this.han + this.pradiusOffset[idx];
      const y = this.dy[idx] + rad * Math.sin(sec);
      const x = this.dx[idx] + rad * Math.cos(sec);
      this.drawParticle(idx, x, y, this.secondHand[i]!, this.colors.main);
    }
  }
}
