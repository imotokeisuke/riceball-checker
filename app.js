document.addEventListener('DOMContentLoaded', function() {
    console.log('🍙 おにぎり食べたねアプリ 初期化開始...');

    // --- Matter.js Modules ---
    if (typeof Matter === 'undefined') {
        console.error('❌ Matter.js が読み込まれていません。');
        return;
    }

    const { Engine, Render, Runner, Bodies, Composite, Mouse, MouseConstraint } = Matter;

    // --- State & Config ---
    let engine, render, runner;
    let ground, wallLeft, wallRight;
    let records = JSON.parse(localStorage.getItem('onigiriRecords')) || [];
    const ONIGIRI_IMAGE = typeof ONIGIRI_BASE64 !== 'undefined' ? ONIGIRI_BASE64.replace(/\s/g, '') : './onigiri.png';
    const ONIGIRI_GOLD_IMAGE = typeof ONIGIRI_GOLD_BASE64 !== 'undefined' ? ONIGIRI_GOLD_BASE64.replace(/\s/g, '') : './onigiri_gold.png';
    const ONIGIRI_SIZE = 60;
    const MAX_ONIGIRI_IN_VIEW = 100;
    
    // Processed base64 images
    let onigiriTextureUrl = ONIGIRI_IMAGE;
    let onigiriGoldTextureUrl = ONIGIRI_GOLD_IMAGE;
    
    let chartInstance = null;

    // --- DOM Elements ---
    const totalDisplay = document.getElementById('total-onigiri');
    const inputField = document.getElementById('onigiri-input');
    const btnPlus = document.getElementById('btn-plus');
    const btnMinus = document.getElementById('btn-minus');
    const btnAdd = document.getElementById('btn-add');
    const btnReset = document.getElementById('btn-reset');
    const btnClearHistory = document.getElementById('btn-clear-history');
    const toast = document.getElementById('toast');
    
    const views = document.querySelectorAll('.app-view');
    const tabItems = document.querySelectorAll('.tab-item');
    const historyList = document.getElementById('history-list');
    const currentMonthTotal = document.getElementById('current-month-total');

    // Check if critical elements exist
    if (!totalDisplay || !btnAdd) {
        console.error('❌ 必須のUI要素が見つかりませんでした。');
        return;
    }

    // --- Initialization ---
    try {
        init();
    } catch (e) {
        console.error('❌ init() 中に致命的なエラーが発生しました:', e);
    }

    async function init() {
        console.log('⚙️ 初期化ステップ 1: Matter.js セットアップ...');
        setupMatter();

        console.log('🖼️ 初期化ステップ 2: 画像の透過処理（くり抜き）...');
        await processSprites();

        console.log('⚙️ 初期化ステップ 3: タブ セットアップ...');
        setupTabs();

        console.log('⚙️ 初期化ステップ 4: 表示更新...');
        updateDisplays();
        
        console.log('⚙️ 初期化ステップ 5: イベントリスナー登録...');
        // Input Controls
        if (btnPlus) {
            btnPlus.addEventListener('click', () => { 
                console.log('＋ ボタンクリック');
                inputField.value = Math.min(50, parseInt(inputField.value) + 1); 
            });
        }
        if (btnMinus) {
            btnMinus.addEventListener('click', () => { 
                console.log('－ ボタンクリック');
                inputField.value = Math.max(1, parseInt(inputField.value) - 1); 
            });
        }
        
        if (btnAdd) {
            btnAdd.addEventListener('click', () => {
                console.log('「食べた！」ボタンクリック');
                const count = parseInt(inputField.value);
                if (count > 0) {
                    saveRecord(count);
                    showToast(`${count}個のおにぎりを食べました！`);
                }
            });
        }

        if (btnReset) {
            btnReset.addEventListener('click', () => {
                console.log('山をリセットクリック');
                clearStack();
                showToast('ふり積もったおにぎりを片付けました');
            });
        }
        
        if (btnClearHistory) {
            btnClearHistory.addEventListener('click', clearAllHistory);
        }

        // Pre-fill screen with some onigiri from today
        const todayStr = new Date().toISOString().split('T')[0];
        const todayCount = Array.isArray(records) ? records
            .filter(r => r.date === todayStr)
            .reduce((sum, r) => sum + r.count, 0) : 0;
        
        const dropLimit = Math.min(todayCount, 40);
        if (dropLimit > 0) {
            console.log(`📦 今日の分 ${dropLimit} 個を降らせます...`);
            setTimeout(() => {
                for (let i = 0; i < dropLimit; i++) {
                    setTimeout(() => dropSingleOnigiri(Math.random() < 0.05), i * 150);
                }
            }, 500);
        }
        
        // Window Resize
        window.addEventListener('resize', () => {
            if (!render || !render.canvas) return;
            render.canvas.width = window.innerWidth;
            render.canvas.height = window.innerHeight;
            if (ground) Matter.Body.setPosition(ground, { x: window.innerWidth / 2, y: window.innerHeight + 30 });
            if (wallLeft) Matter.Body.setPosition(wallLeft, { x: -30, y: window.innerHeight / 2 });
            if (wallRight) Matter.Body.setPosition(wallRight, { x: window.innerWidth + 30, y: window.innerHeight / 2 });
        });

        console.log('✅ すべての初期化が完了しました。');
    }

    async function processSprites() {
        try {
            const normalPromise = removeWhiteBackground(ONIGIRI_IMAGE);
            const goldPromise = removeWhiteBackground(ONIGIRI_GOLD_IMAGE);
            const [normalUrl, goldUrl] = await Promise.all([normalPromise, goldPromise]);
            onigiriTextureUrl = normalUrl;
            onigiriGoldTextureUrl = goldUrl;
            console.log('  画像を透過処理しました。');
        } catch (e) {
            console.warn('  ⚠️ 透過処理に失敗しました。オリジナル画像を使用します:', e);
        }
    }

    function removeWhiteBackground(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = url;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                // 白(240以上)を透明にする。一部のおにぎりのハイライトを保護するため慎重に。
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i], g = data[i+1], b = data[i+2];
                    if (r > 240 && g > 240 && b > 240) {
                        data[i+3] = 0; 
                    }
                }
                ctx.putImageData(imageData, 0, 0);
                resolve(canvas.toDataURL());
            };
            img.onerror = reject;
        });
    }

    function setupMatter() {
        console.log('  Matter.js Engine/Render 作成中...');
        engine = Engine.create();
        const canvasContainer = document.getElementById('canvas-container');
        if (!canvasContainer) {
            console.error('❌ canvas-container が見つかりません。');
            return;
        }

        render = Render.create({
            element: canvasContainer,
            engine: engine,
            options: {
                width: window.innerWidth,
                height: window.innerHeight,
                wireframes: false,
                background: 'transparent'
            }
        });

        console.log('  境界壁を作成中...');
        ground = Bodies.rectangle(window.innerWidth / 2, window.innerHeight - 30, window.innerWidth, 60, { 
            isStatic: true,
            render: { visible: false } 
        });
        wallLeft = Bodies.rectangle(-30, window.innerHeight / 2, 60, window.innerHeight, { 
            isStatic: true,
            render: { visible: false }
        });
        wallRight = Bodies.rectangle(window.innerWidth + 30, window.innerHeight / 2, 60, window.innerHeight, { 
            isStatic: true,
            render: { visible: false }
        });

        Composite.add(engine.world, [ground, wallLeft, wallRight]);

        console.log('  マウス操作を設定中...');
        const mouse = Mouse.create(render.canvas);
        const mouseConstraint = MouseConstraint.create(engine, {
            mouse: mouse,
            constraint: { stiffness: 0.2, render: { visible: false } }
        });
        Composite.add(engine.world, mouseConstraint);
        render.mouse = mouse;

        Render.run(render);
        runner = Runner.create();
        Runner.run(runner, engine);
        console.log('  物理エンジンの実行を開始しました。');
    }

    function setupTabs() {
        tabItems.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetView = tab.getAttribute('data-view');
                console.log(`📑 タブ切り替え: ${targetView}`);
                
                // Update Tabs UI
                tabItems.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Update Views
                views.forEach(v => v.classList.remove('active'));
                document.getElementById(targetView).classList.add('active');
                
                // Refresh content
                if (targetView === 'view-history') renderHistory();
                if (targetView === 'view-stats') renderStats();
            });
        });
    }

    function saveRecord(count) {
        const isGold = Math.random() < 0.05; // 5% chance
        const newRecord = {
            id: Date.now(),
            date: new Date().toISOString().split('T')[0],
            timestamp: new Date().getTime(),
            count: count,
            isGold: isGold
        };
        records.push(newRecord);
        localStorage.setItem('onigiriRecords', JSON.stringify(records));
        
        updateDisplays();
        
        // Drop animation
        for (let i = 0; i < count; i++) {
            setTimeout(() => dropSingleOnigiri(isGold), i * 150);
        }
    }

    function dropSingleOnigiri(isGold = false) {
        const bodies = Composite.allBodies(engine.world);
        if (bodies.length > MAX_ONIGIRI_IN_VIEW + 3) {
            for(let b of bodies) {
                 if(!b.isStatic) { 
                     Composite.remove(engine.world, b); 
                     break; 
                 }
            }
        }

        const startX = Math.random() * (window.innerWidth - 100) + 50;
        const startY = -60;
        
        const onigiri = Bodies.rectangle(startX, startY, ONIGIRI_SIZE * 0.8, ONIGIRI_SIZE * 0.8, {
            restitution: 0.5,
            friction: 0.1,
            render: {
                fillStyle: isGold ? '#ffd700' : '#ffffff', 
                sprite: {
                    texture: isGold ? onigiriGoldTextureUrl : onigiriTextureUrl,
                    xScale: ONIGIRI_SIZE / 1024,
                    yScale: ONIGIRI_SIZE / 1024
                }
            }
        });

        Matter.Body.setAngle(onigiri, Math.random() * Math.PI);
        Composite.add(engine.world, onigiri);
    }

    function updateDisplays() {
        if (!totalDisplay || !currentMonthTotal) return;
        if (!Array.isArray(records)) {
            records = [];
            localStorage.setItem('onigiriRecords', '[]');
        }
        const total = records.reduce((sum, r) => sum + r.count, 0);
        totalDisplay.innerText = total;
        
        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const mTotal = records
            .filter(r => r.date.startsWith(monthStr))
            .reduce((sum, r) => sum + r.count, 0);
        currentMonthTotal.innerText = mTotal;
    }

    function renderHistory() {
        if (!historyList) return;
        if (!Array.isArray(records) || records.length === 0) {
            historyList.innerHTML = '<p class="empty-msg">まだ記録がありません</p>';
            return;
        }

        const sorted = [...records].sort((a, b) => b.timestamp - a.timestamp);
        historyList.innerHTML = sorted.map(r => `
            <div class="history-item">
                <div class="history-info">
                    <span class="history-date">${r.date.replace(/-/g, '/')}</span>
                    <span class="history-count">
                        ${r.isGold ? '<span class="gold-tag">✨黄金</span>' : ''}${r.count}個
                    </span>
                </div>
                <button class="btn-delete-item" onclick="window.deleteOnigiriRecord(${r.id})">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `).join('');
    }

    window.deleteOnigiriRecord = (id) => {
        if (confirm('この記録を削除しますか？')) {
            records = records.filter(r => r.id !== id);
            localStorage.setItem('onigiriRecords', JSON.stringify(records));
            updateDisplays();
            renderHistory();
            showToast('記録を削除しました');
        }
    };

    function renderStats() {
        const chartEl = document.getElementById('monthly-chart');
        if (!chartEl) return;
        
        const ctx = chartEl.getContext('2d');
        
        const monthlyData = {};
        records.forEach(r => {
            const m = r.date.substring(0, 7);
            monthlyData[m] = (monthlyData[m] || 0) + r.count;
        });
        
        const labels = Object.keys(monthlyData).sort();
        const dataSet = labels.map(l => monthlyData[l]);

        if (chartInstance) chartInstance.destroy();

        if (typeof Chart === 'undefined') {
            console.warn('Chart.js is not loaded.');
            return;
        }

        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.map(l => l.replace('-', '年') + '月'),
                datasets: [{
                    label: '食べた個数',
                    data: dataSet,
                    backgroundColor: '#8d6e63',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    function clearStack() {
        const bodies = Composite.allBodies(engine.world);
        bodies.forEach(body => {
            if (!body.isStatic) Composite.remove(engine.world, body);
        });
    }

    function clearAllHistory() {
        if (confirm('すべての履歴を消去します。よろしいですか？')) {
            records = [];
            localStorage.removeItem('onigiriRecords');
            updateDisplays();
            renderHistory();
            if (chartInstance) chartInstance.destroy();
            clearStack();
            showToast('すべての記録を消去しました');
        }
    }

    function showToast(message) {
        if (!toast) return;
        toast.innerText = message;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    // --- Responsive Adjustments ---
    window.addEventListener('resize', () => {
        if (!render || !render.canvas || !ground || !wallLeft || !wallRight) return;
        
        render.canvas.width = window.innerWidth;
        render.canvas.height = window.innerHeight;
        render.options.width = window.innerWidth;
        render.options.height = window.innerHeight;

        // Reposition boundaries
        Matter.Body.setPosition(ground, { x: window.innerWidth / 2, y: window.innerHeight - 30 });
        Matter.Body.setPosition(wallLeft, { x: -30, y: window.innerHeight / 2 });
        Matter.Body.setPosition(wallRight, { x: window.innerWidth + 30, y: window.innerHeight / 2 });
    });
});
