import { Application, Container, Texture, Sprite, BlurFilter, Graphics, Color } from 'pixi.js';

export interface SlotSymbol {
    id: string;
    color: string;
}

export interface SlotEngineOptions {
    width: number;
    height: number;
    cols: number;
    rows: number;
    symbols: SlotSymbol[];
    onStop?: () => void;
    onReelStop?: (colIndex: number) => void;
}

const SYMBOL_SIZE = 120;
const REEL_WIDTH = 140;

interface Particle {
    sprite: Graphics;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
}

export class SlotEngine {
    public app: Application;
    public isInitialized = false;
    private container: HTMLElement;
    private reelLayer: Container;
    private effectLayer: Container;
    private particles: Particle[] = [];
    private winningSprites: { sprite: Sprite; originalScale: number; timer: number }[] = [];
    private lightningGraphics: Graphics;
    private lightningTimer: number = 0;
    private reels: {
        container: Container;
        position: number;
        velocity: number;
        blur: BlurFilter;
        sprites: Sprite[];
        targetPosition: number;
        state: 'idle' | 'spinning' | 'stopping';
        thudPlayed: boolean;
    }[] = [];
    private options: SlotEngineOptions;
    private textures: Record<string, Texture> = {};
    private isInternalSpinning = false;
    
    // Physics
    private MAX_SPEED = 70;
    private SPRING_TENSION = 180;
    private SPRING_FRICTION = 24;

    constructor(container: HTMLElement, options: SlotEngineOptions) {
        this.container = container;
        this.options = options;
        this.app = new Application();
        this.reelLayer = new Container();
        this.effectLayer = new Container();
        this.lightningGraphics = new Graphics();
    }

    public async init() {
        await this.app.init({
            width: this.options.width,
            height: this.options.height,
            backgroundAlpha: 0,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        });
        
        if (!this.app || !this.app.renderer) return;

        this.isInitialized = true;
        this.container.appendChild(this.app.canvas);

        await this.createTextures();
        
        // Final sanity check before DOM linking
        if (!this.app || !this.app.renderer) return;
        
        this.app.stage.addChild(this.reelLayer);
        this.app.stage.addChild(this.effectLayer);
        this.effectLayer.addChild(this.lightningGraphics);

        this.buildReels();

        this.app.ticker.add(() => this.update(this.app.ticker.deltaMS));
    }

    private async createTextures() {
        const emojiMap: Record<string, string> = {
            diamond: '💎',
            dice: '🎲',
            flame: '🔥',
            star: '⭐',
            medal: '🥇',
            freespin: '⚡'
        };

        for (const sym of this.options.symbols) {
            const canvas = document.createElement('canvas');
            canvas.width = SYMBOL_SIZE;
            canvas.height = SYMBOL_SIZE;
            const ctx = canvas.getContext('2d')!;
            
            // Premium Gradient/Glass effect for symbols
            const grad = ctx.createRadialGradient(SYMBOL_SIZE/2, SYMBOL_SIZE/2, 10, SYMBOL_SIZE/2, SYMBOL_SIZE/2, SYMBOL_SIZE/2);
            grad.addColorStop(0, '#1a1a1a');
            grad.addColorStop(1, '#050505');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(SYMBOL_SIZE/2, SYMBOL_SIZE/2, SYMBOL_SIZE/2 - 4, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = sym.color;
            ctx.lineWidth = 4;
            ctx.stroke();

            // Inner styling
            const emoji = emojiMap[sym.id] || sym.id;
            ctx.fillStyle = sym.color;
            // Use larger font for emojis
            ctx.font = `${SYMBOL_SIZE * 0.4}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = sym.color;
            ctx.shadowBlur = 8;
            ctx.fillText(emoji, SYMBOL_SIZE/2, SYMBOL_SIZE/2);

            this.textures[sym.id] = Texture.from(canvas);
        }
    }

    private buildReels() {
        const reelContainer = new Container();
        reelContainer.name = "reelContainer";
        reelContainer.x = (this.options.width - (this.options.cols * REEL_WIDTH)) / 2;
        reelContainer.y = (this.options.height - (this.options.rows * SYMBOL_SIZE)) / 2;
        
        // Background mask to hide symbols outside bounds
        const mask = new Graphics();
        mask.rect(0, 0, this.options.cols * REEL_WIDTH, this.options.rows * SYMBOL_SIZE);
        mask.fill(0xffffff);
        reelContainer.addChild(mask);
        reelContainer.mask = mask;

        for (let i = 0; i < this.options.cols; i++) {
            const rc = new Container();
            rc.x = i * REEL_WIDTH;
            reelContainer.addChild(rc);

            const blur = new BlurFilter();
            blur.blurX = 0;
            blur.blurY = 0;
            rc.filters = [blur];

            const sprites: Sprite[] = [];
            // We need enough sprites to fill the screen + 1 for wrapping
            for (let j = 0; j < this.options.rows + 1; j++) {
                const randomSym = this.options.symbols[Math.floor(Math.random() * this.options.symbols.length)];
                const sprite = new Sprite(this.textures[randomSym.id]);
                sprite.anchor.set(0.5);
                sprite.y = j * SYMBOL_SIZE + SYMBOL_SIZE / 2;
                sprite.x = REEL_WIDTH / 2;
                rc.addChild(sprite);
                sprites.push(sprite);
            }

            this.reels.push({
                container: rc,
                position: 0,
                velocity: 0,
                blur,
                sprites,
                targetPosition: 0,
                state: 'idle',
                thudPlayed: false
            });
        }

        // --- REALISM UPGRADE: Physical Reel Illusions ---
        // 1. Add top/bottom shadows to emulate a cylindrical shape receding into the machine
        // 2. Add mechanical metal dividers between the reels
        const overlayCanvas = document.createElement('canvas');
        const overlayWidth = this.options.cols * REEL_WIDTH;
        const overlayHeight = this.options.rows * SYMBOL_SIZE;
        overlayCanvas.width = overlayWidth;
        overlayCanvas.height = overlayHeight;
        const oCtx = overlayCanvas.getContext('2d')!;

        // Draw shadow gradient
        const gradient = oCtx.createLinearGradient(0, 0, 0, overlayHeight);
        gradient.addColorStop(0, 'rgba(0,0,0,0.85)'); // Dark top
        gradient.addColorStop(0.15, 'rgba(0,0,0,0.1)'); // Fades out
        gradient.addColorStop(0.85, 'rgba(0,0,0,0.1)'); // Fades in
        gradient.addColorStop(1, 'rgba(0,0,0,0.85)'); // Dark bottom
        oCtx.fillStyle = gradient;
        oCtx.fillRect(0, 0, overlayWidth, overlayHeight);

        // Draw physical separators between the reels to look like individual cylinders
        oCtx.lineWidth = 4;
        for (let i = 1; i < this.options.cols; i++) {
            const x = i * REEL_WIDTH;
            
            // Draw a subtle dual-tone line to look like a metallic crevice
            oCtx.beginPath();
            oCtx.strokeStyle = '#050505'; // Deep shadow
            oCtx.moveTo(x - 2, 0);
            oCtx.lineTo(x - 2, overlayHeight);
            oCtx.stroke();
            
            oCtx.beginPath();
            oCtx.strokeStyle = '#2a2a2a'; // Metal highlight
            oCtx.moveTo(x + 2, 0);
            oCtx.lineTo(x + 2, overlayHeight);
            oCtx.stroke();
        }

        const overlayTexture = Texture.from(overlayCanvas);
        const overlaySprite = new Sprite(overlayTexture);
        reelContainer.addChild(overlaySprite);
        // ------------------------------------------------

        this.reelLayer.addChild(reelContainer);
    }

    public spin() {
        this.isInternalSpinning = true;
        this.clearHighlights();
        for (let i = 0; i < this.reels.length; i++) {
            const r = this.reels[i];
            r.state = 'spinning';
            r.velocity = 0; // Reset velocity
        }
    }

    public highlightWinningSymbols(winningCoords: { row: number; col: number }[]) {
        const reelContainer = this.reelLayer.getChildByName("reelContainer") as Container;
        if (!reelContainer) return;

        winningCoords.forEach(coord => {
            const reel = this.reels[coord.col];
            // Find which sprite is currently at this row
            // In our system, the sprites wrap. 
            // The row index in the grid corresponds to the sprite's relative Y position within the mask.
            const WRAP_SIZE = reel.sprites.length * SYMBOL_SIZE;
            
            for (const sprite of reel.sprites) {
                // Approximate which sprite is in the visible row 'coord.row'
                // The visible area starts at 0 and goes to rows * SYMBOL_SIZE
                // sprite.y is relative to rc container.
                // We need to account for wrapping.
                const relativeY = ((sprite.y % WRAP_SIZE) + WRAP_SIZE) % WRAP_SIZE;
                const rowY = coord.row * SYMBOL_SIZE + SYMBOL_SIZE / 2;
                
                if (Math.abs(relativeY - rowY) < SYMBOL_SIZE / 2) {
                    this.winningSprites.push({
                        sprite,
                        originalScale: sprite.scale.x,
                        timer: 0
                    });
                    
                    // Spawn particles at center of sprite
                    const globalPos = sprite.toGlobal(this.app.stage);
                    this.createExplosion(globalPos.x, globalPos.y);
                }
            }
        });
    }

    private clearHighlights() {
        this.winningSprites.forEach(ws => {
            ws.sprite.scale.set(ws.originalScale);
            ws.sprite.alpha = 1;
        });
        this.winningSprites = [];
    }

    private createExplosion(x: number, y: number) {
        for (let i = 0; i < 40; i++) {
            const g = new Graphics();
            g.circle(0, 0, 3 + Math.random() * 5);
            g.fill(new Color({ h: Math.random() * 60 + 30, s: 100, l: 60 })); // Gold/Yellow spectrum
            g.x = x;
            g.y = y;
            
            this.effectLayer.addChild(g);
            
            this.particles.push({
                sprite: g,
                vx: (Math.random() - 0.5) * 20,
                vy: (Math.random() - 0.5) * 20 - 5, // Slightly upward bias
                life: 0,
                maxLife: 40 + Math.random() * 40
            });
        }
    }

    public stop(outcomeGrid: any[][]) {
        const WRAP_SIZE = (this.options.rows + 1) * SYMBOL_SIZE;

        for (let i = 0; i < this.reels.length; i++) {
            const r = this.reels[i];
            
            setTimeout(() => {
                if (!this.app || !this.app.renderer) return;
                r.state = 'stopping';
                r.thudPlayed = false;
                
                const currentWrap = Math.floor(r.position / WRAP_SIZE);
                // Must be an integer to ensure perfectly synchronized modulus mapping
                const extraWraps = 3; 
                r.targetPosition = (currentWrap + extraWraps) * WRAP_SIZE;
                
                for (let j = 0; j < r.sprites.length; j++) {
                    const finalY = (j * SYMBOL_SIZE) % WRAP_SIZE - SYMBOL_SIZE;
                    const rowIndex = Math.round(finalY / SYMBOL_SIZE);

                    if (rowIndex >= 0 && rowIndex < this.options.rows) {
                         r.sprites[j].texture = this.textures[outcomeGrid[rowIndex][i].id];
                    } else {
                         const randomSym = this.options.symbols[Math.floor(Math.random() * this.options.symbols.length)];
                         r.sprites[j].texture = this.textures[randomSym.id];
                    }
                }
            }, i * 350); 
        }
    }

    private update(deltaMs: number) {
        if (!this.app || !this.app.renderer) return;

        let allIdle = true;
        const deltaSec = deltaMs / 1000;

        for (let i = 0; i < this.reels.length; i++) {
            const r = this.reels[i];
            
            if (r.state === 'spinning') {
                allIdle = false;
                r.velocity += 250 * deltaSec; // Faster acceleration
                if (r.velocity > this.MAX_SPEED) r.velocity = this.MAX_SPEED;
                r.position += r.velocity * (deltaMs / 16);
            } else if (r.state === 'stopping') {
                allIdle = false;
                
                if (!r.thudPlayed) {
                    // Pre-impact approach phase (still spinning down)
                    r.velocity -= 150 * deltaSec; 
                    if (r.velocity < 40) r.velocity = 40; // Maintain heavy slam speed
                    r.position += r.velocity * (deltaMs / 16);
                    
                    if (r.position >= r.targetPosition) {
                        // Impact exactly!
                        r.position = r.targetPosition + 20; // Visual mechanical overshoot downwards
                        r.velocity = -6; // Fixed linear snap-back speed upwards
                        r.thudPlayed = true;
                        
                        // SYNC: Play sound precisely on impact
                        if (this.options.onReelStop) this.options.onReelStop(i);
                    }
                } else {
                    // Post-impact Snap-back phase
                    r.position += r.velocity * (deltaMs / 16);
                    
                    // We are traveling upwards (negative velocity), check if we crossed back to the target line
                    if (r.position <= r.targetPosition) {
                        r.position = r.targetPosition;
                        r.velocity = 0;
                        r.state = 'idle';
                    }
                }
            }

            // Update blur
            r.blur.blurY = Math.abs(r.velocity) * 0.8;

            // Update positions of sprites, wrapping them correctly using positive modulo
            const WRAP_SIZE = r.sprites.length * SYMBOL_SIZE;
            for (let j = 0; j < r.sprites.length; j++) {
                const rawY = (r.position + j * SYMBOL_SIZE);
                r.sprites[j].y = (((rawY + SYMBOL_SIZE / 2) % WRAP_SIZE) + WRAP_SIZE) % WRAP_SIZE; 
            }
        }

        // --- Winning Animations Update ---
        this.winningSprites.forEach(ws => {
            ws.timer += deltaMs / 16;
            const pulse = 1 + Math.sin(ws.timer * 0.2) * 0.15;
            ws.sprite.scale.set(ws.originalScale * pulse);
        });

        // --- Particle Update ---
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life++;
            p.sprite.x += p.vx;
            p.sprite.y += p.vy;
            p.vy += 0.2; // Gravity
            p.sprite.alpha = 1 - p.life / p.maxLife;
            
            if (p.life >= p.maxLife) {
                this.effectLayer.removeChild(p.sprite);
                this.particles.splice(i, 1);
            }
        }

        // --- Lightning Update ---
        this.lightningGraphics.clear();
        this.lightningTimer += deltaMs / 16;
        if (Math.random() < 0.05) { // Chance for a lightning bolt
             this.drawLightning();
        }

        // Detect if all reels just finished stopping
        if (allIdle && this.isInternalSpinning && this.isInitialized) {
             this.isInternalSpinning = false;
             if (this.options.onStop) this.options.onStop();
        }
    }

    private drawLightning() {
        const x = Math.random() * this.options.width;
        let curY = 0;
        let curX = x;
        
        this.lightningGraphics.lineStyle(2, 0xaaaaff, 0.8);
        this.lightningGraphics.moveTo(x, 0);
        
        while (curY < this.options.height) {
            curY += 10 + Math.random() * 20;
            curX += (Math.random() - 0.5) * 40;
            this.lightningGraphics.lineTo(curX, curY);
        }
        
        // Brief flash effect
        setTimeout(() => {
            this.lightningGraphics.clear();
        }, 50);
    }

    public onComplete() {
         if (this.options.onStop) this.options.onStop();
    }

    public destroy() {
        if (this.app) {
            try {
                this.app.destroy({ removeView: true }, { children: true });
            } catch (e) {
                // Ignore destruction errors (e.g. this._cancelResize not a function) if interrupted
                console.warn("PixiJS application destroyed before initialization natively completed", e);
            }
            this.app = null as any;
        }
    }
}
