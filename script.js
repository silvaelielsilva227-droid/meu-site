/* =========================================================
   1. UTILITÁRIOS DE ZOOM E ATALHOS DE TECLADO (F11, CTRL+K, ESC)
   ========================================================= */
let nivelZoom = parseFloat(localStorage.getItem("almox_zoom_level")) || 0;
function aplicarZoom(mudanca) {
  nivelZoom = Math.min(3, Math.max(-2, nivelZoom + mudanca));
  localStorage.setItem("almox_zoom_level", nivelZoom);
  if (typeof nw !== "undefined") {
    nw.Window.get().zoomLevel = nivelZoom;
  } else {
    document.body.style.zoom = 1 + nivelZoom * 0.08;
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "F11") {
    e.preventDefault();
    if (typeof nw !== "undefined") nw.Window.get().toggleFullscreen();
    else if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    const inp = document.getElementById("global-search");
    if (inp) inp.focus();
  }
  if (e.ctrlKey && (e.key === "+" || e.key === "=" || e.key === "-")) {
    e.preventDefault();
    aplicarZoom(e.key === "-" ? -0.5 : 0.5);
  }
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay.active").forEach((m) => m.classList.remove("active"));
  }
});

/* =========================================================
   2. MÓDULO PRINCIPAL DO ALMOXARIFADO PRO
   ========================================================= */
const App = (() => {
  const UNIDADES_RAPIDAS = [
    "CRAS",
    "CREAS",
    "Centro de Qualificação",
    "Conselho Tutelar",
    "Sede - Secretaria (FMAS)",
    "CadÚnico / Bolsa Família",
    "Programa Criança Feliz"
  ];

  const CATEGORIAS_INICIAIS = [
    "Escritório",
    "Limpeza",
    "Expediente",
    "Copa e Cozinha",
    "Descartáveis",
    "Informática"
  ];

  const MATERIAIS_INICIAIS = [
    { id: "MAT_1", codigo: "01", nome: "Papel Sulfite A4 75g (500 fls)", categoria: "Escritório", qtd: 45, unidade: "Resma", minimo: 10, local: "Armário 01 - Prat. A", deleted: false },
    { id: "MAT_2", codigo: "02", nome: "Caneta Esferográfica Azul Cristal", categoria: "Escritório", qtd: 12, unidade: "Cx.", minimo: 5, local: "Armário 01 - Gaveta 2", deleted: false },
    { id: "MAT_3", codigo: "03", nome: "Água Sanitária 1 Litro", categoria: "Limpeza", qtd: 8, unidade: "Unid.", minimo: 15, local: "Depósito Limpeza - B1", deleted: false },
    { id: "MAT_4", codigo: "04", nome: "Detergente Líquido Neutro 500ml", categoria: "Limpeza", qtd: 24, unidade: "Unid.", minimo: 12, local: "Depósito Limpeza - B2", deleted: false },
    { id: "MAT_5", codigo: "05", nome: "Copo Descartável 180ml (Tira 100 un)", categoria: "Descartáveis", qtd: 6, unidade: "Pct.", minimo: 10, local: "Estante 03", deleted: false },
    { id: "MAT_6", codigo: "06", nome: "Envelope Saco Kraft Pardo A4", categoria: "Expediente", qtd: 120, unidade: "Unid.", minimo: 30, local: "Armário 02", deleted: false }
  ];

  const state = {
    db: null,
    materiais: [],
    historico: [],
    categorias: [],
    categoriaAtiva: "Todas",
    termoBusca: "",
    wordPendenteHtml: "",
    charts: { unidades: null, categorias: null }
  };

  // Carrega categorias salvas ou padrões
  try {
    const salvas = localStorage.getItem("almox_categorias");
    state.categorias = salvas ? JSON.parse(salvas) : [...CATEGORIAS_INICIAIS];
  } catch (e) {
    state.categorias = [...CATEGORIAS_INICIAIS];
  }

  const renderIcons = (root) => {
    if (window.lucide) {
      try { lucide.createIcons(root ? { root } : undefined); } catch (e) {}
    }
  };

  /* =========================================================
     3. COMPONENTE CUSTOM SELECT (LISTAS SUSPENSAS BONITAS)
     ========================================================= */
  const CustomSelect = {
    init: (id) => {
      const ns = document.getElementById(id);
      if (!ns) return;
      if (ns.nextElementSibling && ns.nextElementSibling.classList.contains("custom-select-wrapper")) {
        ns.nextElementSibling.remove();
      }
      const w = document.createElement("div");
      w.className = "custom-select-wrapper";
      const t = document.createElement("div");
      t.className = "custom-select-trigger";
      const ao = ns.options[ns.selectedIndex];
      t.innerHTML = `<span>${ao ? ao.text : "Selecione..."}</span> <i data-lucide="chevron-down"></i>`;
      const dp = document.createElement("div");
      dp.className = "custom-select-dropdown";

      Array.from(ns.options).forEach((opt, idx) => {
        const i = document.createElement("div");
        i.className = `custom-option ${opt.selected ? "selected" : ""}`;
        i.textContent = opt.text;
        i.addEventListener("click", (e) => {
          e.stopPropagation();
          ns.selectedIndex = idx;
          ns.value = opt.value;
          t.querySelector("span").textContent = opt.text;
          dp.querySelectorAll(".custom-option").forEach((o) => o.classList.remove("selected"));
          i.classList.add("selected");
          w.classList.remove("open");
          ns.dispatchEvent(new Event("change"));
        });
        dp.appendChild(i);
      });

      t.addEventListener("click", (e) => {
        e.stopPropagation();
        document.querySelectorAll(".custom-select-wrapper").forEach((cw) => {
          if (cw !== w) cw.classList.remove("open");
        });
        w.classList.toggle("open");
      });

      w.appendChild(t);
      w.appendChild(dp);
      ns.parentNode.insertBefore(w, ns.nextSibling);
      renderIcons(w);
    },
    closeAll: () => {
      document.querySelectorAll(".custom-select-wrapper").forEach((w) => w.classList.remove("open"));
    }
  };
  document.addEventListener("click", CustomSelect.closeAll);

  /* =========================================================
     4. UTILITÁRIOS E SALVAMENTO ASSISTIDO DE WORD (ONDE SALVAR + NOME)
     ========================================================= */
  const Utils = {
    formatDate: (d) => {
      if (!d) return "--/--/----";
      const p = d.split("-");
      return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
    },
    getMonthName: (m) => [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ][parseInt(m, 10) - 1] || "",
    hojeISO: () => new Date().toISOString().split("T")[0],
    toast: (msg, type = "success") => {
      const box = document.getElementById("toast-container");
      const el = document.createElement("div");
      el.className = "toast";
      const icon = type === "success" ? "check-circle-2" : "alert-octagon";
      const cor = type === "success" ? "var(--success)" : "var(--danger)";
      el.innerHTML = `<i data-lucide="${icon}" style="color:${cor}"></i> <span>${msg}</span>`;
      box.appendChild(el);
      renderIcons(el);
      setTimeout(() => el.remove(), 3200);
    },

    // Passo 1: Abre o modal perguntando o nome do arquivo antes de baixar
    solicitarSalvamentoWord: (nomeSugerido, htmlContent) => {
      state.wordPendenteHtml = htmlContent;
      const limpo = (nomeSugerido || "Documento_Almoxarifado").replace(/\.doc$/i, "");
      const inp = document.getElementById("word-nome-arquivo");
      inp.value = limpo;
      document.getElementById("modalSalvarWord").classList.add("active");
      setTimeout(() => {
        inp.focus();
        inp.select();
      }, 80);
    },

    // Passo 2: Abre a janela "Salvar Como..." para escolher a pasta no computador
    confirmarGravacaoWord: async () => {
      let nomeDigitado = document.getElementById("word-nome-arquivo").value.trim() || "Documento_Almoxarifado";
      nomeDigitado = nomeDigitado.replace(/[\\/:*?"<>|]/g, "_");
      if (!nomeDigitado.toLowerCase().endsWith(".doc")) {
        nomeDigitado += ".doc";
      }

      const conteudoFinal = "\ufeff" + state.wordPendenteHtml;
      document.getElementById("modalSalvarWord").classList.remove("active");

      // Ambiente Desktop NW.js
      if (typeof nw !== "undefined" && typeof require !== "undefined") {
        const inputSave = document.createElement("input");
        inputSave.type = "file";
        inputSave.setAttribute("nwsaveas", nomeDigitado);
        inputSave.setAttribute("accept", ".doc");
        inputSave.style.display = "none";
        document.body.appendChild(inputSave);

        inputSave.addEventListener("change", function () {
          if (this.value) {
            const fs = require("fs");
            fs.writeFileSync(this.value, conteudoFinal, "utf8");
            Utils.toast("Arquivo Word salvo na pasta escolhida!");
          }
          document.body.removeChild(inputSave);
        }, { once: true });
        inputSave.click();
        return;
      }

      // Navegadores Modernos (Chrome / Edge / Brave / Opera): Abre janela nativa "Salvar Como..."
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: nomeDigitado,
            types: [
              {
                description: "Documento do Microsoft Word (.doc)",
                accept: { "application/msword": [".doc"] }
              }
            ]
          });
          const writable = await handle.createWritable();
          await writable.write(new Blob([conteudoFinal], { type: "application/msword;charset=utf-8" }));
          await writable.close();
          Utils.toast("Documento Word salvo com sucesso na pasta escolhida!");
          return;
        } catch (err) {
          if (err.name === "AbortError") return; // Usuário cancelou a janela de pasta
        }
      }

      // Fallback caso o navegador bloqueie a API de pastas
      const blob = new Blob([conteudoFinal], { type: "application/msword;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nomeDigitado;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      Utils.toast(`Arquivo "${nomeDigitado}" gerado com sucesso!`);
    }
  };

  /* =========================================================
     5. BANCO DE DADOS OFFLINE (INDEXEDDB)
     ========================================================= */
  const DB = {
    init: (cb) => {
      const req = indexedDB.open("AlmoxarifadoProDB", 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("materiais")) db.createObjectStore("materiais", { keyPath: "id" });
        if (!db.objectStoreNames.contains("historico")) db.createObjectStore("historico", { keyPath: "id" });
      };
      req.onsuccess = (e) => {
        state.db = e.target.result;
        DB.load(cb);
      };
      req.onerror = () => {
        Utils.toast("Erro ao acessar banco de dados local.", "error");
        if (cb) cb();
      };
    },
    load: (cb) => {
      const tx = state.db.transaction(["materiais", "historico"], "readonly");
      const p1 = new Promise((res) => {
        tx.objectStore("materiais").getAll().onsuccess = (e) => {
          state.materiais = e.target.result || [];
          res();
        };
      });
      const p2 = new Promise((res) => {
        tx.objectStore("historico").getAll().onsuccess = (e) => {
          state.historico = e.target.result || [];
          res();
        };
      });
      Promise.all([p1, p2]).then(() => {
        if (state.materiais.length === 0 && !localStorage.getItem("almox_seeded")) {
          localStorage.setItem("almox_seeded", "true");
          MATERIAIS_INICIAIS.forEach((m) => DB.save("materiais", m));
          state.materiais = [...MATERIAIS_INICIAIS];
        }
        if (cb) cb();
      });
    },
    save: (store, obj, cb) => {
      const tx = state.db.transaction([store], "readwrite");
      tx.objectStore(store).put(obj);
      tx.oncomplete = () => {
        const arr = state[store];
        const i = arr.findIndex((x) => x.id === obj.id);
        if (i > -1) arr[i] = obj;
        else arr.push(obj);
        if (cb) cb();
      };
    },
    delete: (store, id, cb) => {
      const tx = state.db.transaction([store], "readwrite");
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => {
        state[store] = state[store].filter((x) => x.id !== id);
        if (cb) cb();
      };
    }
  };

  /* =========================================================
     6. GESTÃO DE CATEGORIAS DINÂMICAS
     ========================================================= */
  const Categorias = {
    salvarLocal: () => {
      localStorage.setItem("almox_categorias", JSON.stringify(state.categorias));
    },

    renderPillsESelects: () => {
      // 1. Pílulas na barra da Prateleira
      const pillsBox = document.getElementById("category-pills-container");
      if (pillsBox) {
        let html = `
          <button class="cat-pill ${state.categoriaAtiva === "Todas" ? "active" : ""}" onclick="window.app.selecionarCategoria('Todas')">
            <i data-lucide="sparkles"></i> Todos
          </button>
        `;
        state.categorias.forEach((cat) => {
          const ativo = state.categoriaAtiva === cat ? "active" : "";
          html += `
            <button class="cat-pill ${ativo}" onclick="window.app.selecionarCategoria('${cat}')">
              <i data-lucide="tag"></i> ${cat}
            </button>
          `;
        });
        html += `
          <button class="cat-pill cat-pill-add" onclick="window.app.abrirModalCategorias()" title="Criar ou remover categorias">
            <i data-lucide="plus"></i> Nova Categoria
          </button>
        `;
        pillsBox.innerHTML = html;
        renderIcons(pillsBox);
      }

      // 2. Select dentro do modal de Cadastrar Material
      const selCat = document.getElementById("mat-categoria");
      if (selCat) {
        const valAtual = selCat.value;
        selCat.innerHTML = "";
        state.categorias.forEach((cat) => {
          selCat.innerHTML += `<option value="${cat}">${cat}</option>`;
        });
        if (valAtual && state.categorias.includes(valAtual)) selCat.value = valAtual;
        CustomSelect.init("mat-categoria");
      }
    },

    abrirModal: () => {
      document.getElementById("nova-categoria-nome").value = "";
      Categorias.renderListaModal();
      document.getElementById("modalCategorias").classList.add("active");
      setTimeout(() => document.getElementById("nova-categoria-nome").focus(), 80);
    },

    renderListaModal: () => {
      const box = document.getElementById("lista-categorias-modal");
      if (!box) return;
      box.innerHTML = "";
      state.categorias.forEach((cat) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid var(--border-glass); border-radius:10px;";
        row.innerHTML = `
          <strong style="color:white; font-size:13px;">${cat}</strong>
          <button type="button" class="btn-mini-icon del" onclick="window.app.removerCategoria('${cat}')" title="Excluir Categoria">
            <i data-lucide="trash-2" style="width:14px;"></i>
          </button>
        `;
        box.appendChild(row);
      });
      renderIcons(box);
    },

    adicionar: () => {
      const inp = document.getElementById("nova-categoria-nome");
      const nome = inp.value.trim();
      if (!nome) return;
      if (state.categorias.some((c) => c.toLowerCase() === nome.toLowerCase())) {
        return Utils.toast("Esta categoria já existe!", "error");
      }
      state.categorias.push(nome);
      Categorias.salvarLocal();
      inp.value = "";
      Categorias.renderListaModal();
      Categorias.renderPillsESelects();
      Utils.toast(`Categoria "${nome}" adicionada!`);
    },

    remover: (nome) => {
      if (state.categorias.length <= 1) {
        return Utils.toast("Mantenha pelo menos uma categoria no sistema.", "error");
      }
      if (confirm(`Deseja remover a categoria "${nome}" da lista de seleção?`)) {
        state.categorias = state.categorias.filter((c) => c !== nome);
        if (state.categoriaAtiva === nome) state.categoriaAtiva = "Todas";
        Categorias.salvarLocal();
        Categorias.renderListaModal();
        Categorias.renderPillsESelects();
        Estoque.render();
        Utils.toast("Categoria removida.");
      }
    }
  };

  const Security = {
    init: () => {
      // Aguarda o carregamento do módulo Firebase e verifica se já está logado
      const checarFirebase = setInterval(() => {
        if (window.firebaseAuth) {
          clearInterval(checarFirebase);
          window.firebaseAuth.onChange((user) => {
            const lockScreen = document.getElementById("lock-screen");
            if (user) {
              // Usuário logado: libera o sistema
              lockScreen.style.display = "none";
            } else {
              // Usuário deslogado: mostra a tela de login
              lockScreen.style.display = "flex";
            }
          });
        }
      }, 100);
    },

    unlock: async () => {
      const email = document.getElementById("login-email").value.trim();
      const senha = document.getElementById("login-senha").value;
      const btn = document.getElementById("btn-login-submit");

      if (!email || !senha) {
        return Utils.toast("Preencha o e-mail e a senha!", "error");
      }

      if (!window.firebaseAuth) {
        return Utils.toast("Conectando ao servidor... Tente novamente em 1 segundo.", "error");
      }

      try {
        btn.disabled = true;
        btn.textContent = "Verificando acesso...";
        await window.firebaseAuth.signIn(email, senha);
        document.getElementById("login-senha").value = "";
        Utils.toast("Login realizado com sucesso! Bem-vindo(a).");
      } catch (erro) {
        Utils.toast("E-mail ou senha incorretos!", "error");
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="log-in"></i> Entrar no Sistema`;
        renderIcons(btn);
      }
    },

    logout: async () => {
      if (window.firebaseAuth) {
        await window.firebaseAuth.logout();
        Utils.toast("Sessão encerrada com segurança.");
      }
    }
  };

  const Personalizacao = {
    init: () => {
      Personalizacao.setTheme(localStorage.getItem("almox_theme") || "indigo");
      const logo = localStorage.getItem("almox_logo");
      if (logo) Personalizacao.aplicarLogo(logo);
      const bg = localStorage.getItem("almox_bg");
      const bgType = localStorage.getItem("almox_bg_type");
      if (bg) Personalizacao.aplicarBg(bg, bgType);
    },
    setTheme: (nome) => {
      const paletas = {
        indigo: { m: "#6366f1", g: "rgba(99,102,241,0.25)" },
        emerald: { m: "#10b981", g: "rgba(16,185,129,0.25)" },
        ruby: { m: "#f43f5e", g: "rgba(244,63,94,0.25)" },
        gold: { m: "#f59e0b", g: "rgba(245,158,11,0.25)" },
        ocean: { m: "#0ea5e9", g: "rgba(14,165,233,0.25)" },
        neon: { m: "#d946ef", g: "rgba(217,70,239,0.25)" }
      };
      if (!paletas[nome]) return;
      document.documentElement.style.setProperty("--accent", paletas[nome].m);
      document.documentElement.style.setProperty("--accent-glow", paletas[nome].g);
      localStorage.setItem("almox_theme", nome);
      document.querySelectorAll(".theme-btn").forEach((b) => b.classList.toggle("active", b.dataset.theme === nome));
      Estoque.atualizarGraficos();
    },
    aplicarLogo: (b64) => {
      document.querySelectorAll(".white-label-target").forEach((el) => {
        if (b64) {
          el.innerHTML = `<img src="${b64}" style="width:100%;height:100%;object-fit:contain;border-radius:12px;" />`;
          el.style.background = "transparent";
        } else {
          el.innerHTML = `<i data-lucide="boxes"></i>`;
          el.style.background = "";
        }
      });
      renderIcons();
    },
    uploadLogo: (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = (ev) => {
        localStorage.setItem("almox_logo", ev.target.result);
        Personalizacao.aplicarLogo(ev.target.result);
        Utils.toast("Logotipo atualizado!");
      };
      r.readAsDataURL(f);
    },
    aplicarBg: (src, type) => {
      const vid = document.getElementById("bg-video");
      if (!src) {
        document.body.classList.remove("custom-bg");
        document.body.style.backgroundImage = "";
        if (vid) { vid.style.display = "none"; vid.src = ""; }
        return;
      }
      document.body.classList.add("custom-bg");
      if (type === "video") {
        document.body.style.backgroundImage = "none";
        if (vid) { vid.src = src; vid.style.display = "block"; }
      } else {
        if (vid) { vid.style.display = "none"; vid.src = ""; }
        document.body.style.backgroundImage = `url('${src}')`;
      }
    },
    uploadBg: (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const isVid = f.type.startsWith("video/");
      const url = URL.createObjectURL(f);
      localStorage.setItem("almox_bg", url);
      localStorage.setItem("almox_bg_type", isVid ? "video" : "image");
      Personalizacao.aplicarBg(url, isVid ? "video" : "image");
      Utils.toast("Plano de fundo aplicado!");
    },
    resetVisual: () => {
      localStorage.removeItem("almox_logo");
      localStorage.removeItem("almox_bg");
      Personalizacao.aplicarLogo(null);
      Personalizacao.aplicarBg(null);
      Utils.toast("Visual padrão restaurado.");
    }
  };

  /* =========================================================
     8. PRATELEIRA DE ESTOQUE, BLOQUEIO DE Nº REPETIDO E REPOSIÇÃO COM UNIDADE
     ========================================================= */
  const Estoque = {
    // Normaliza código para evitar que "01" e "1" se repitam
    normalizarCodigo: (cod) => {
      const s = String(cod || "").trim().toLowerCase();
      return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s;
    },

    verificarCodigoDuplicado: () => {
      const idAtual = document.getElementById("mat-id").value;
      const codDigitado = document.getElementById("mat-codigo").value.trim();
      const aviso = document.getElementById("aviso-codigo-duplicado");
      if (!codDigitado) {
        aviso.style.display = "none";
        return false;
      }
      const norm = Estoque.normalizarCodigo(codDigitado);
      const duplicado = state.materiais.find(
        (m) => !m.deleted && m.id !== idAtual && Estoque.normalizarCodigo(m.codigo) === norm
      );
      if (duplicado) {
        aviso.textContent = `⚠️ Nº já usado em: "${duplicado.nome}"`;
        aviso.style.display = "block";
        return duplicado;
      }
      aviso.style.display = "none";
      return null;
    },

    gerarProximoCodigoLivre: () => {
      let num = 1;
      const usados = new Set(
        state.materiais.filter((m) => !m.deleted).map((m) => Estoque.normalizarCodigo(m.codigo))
      );
      while (usados.has(String(num))) {
        num++;
      }
      return num.toString().padStart(2, "0");
    },

    abrirModalMaterial: (id = "") => {
      document.getElementById("form-material").reset();
      document.getElementById("mat-id").value = "";
      document.getElementById("aviso-codigo-duplicado").style.display = "none";
      Categorias.renderPillsESelects();

      if (id) {
        const m = state.materiais.find((x) => x.id === id);
        if (!m) return;
        document.getElementById("mat-id").value = m.id;
        document.getElementById("mat-codigo").value = m.codigo || "";
        document.getElementById("mat-nome").value = m.nome;
        document.getElementById("mat-categoria").value = m.categoria;
        document.getElementById("mat-qtd").value = m.qtd;
        document.getElementById("mat-unidade").value = m.unidade;
        document.getElementById("mat-minimo").value = m.minimo;
        document.getElementById("mat-local").value = m.local || "";
        document.getElementById("modal-material-titulo").innerHTML = `<i data-lucide="pencil" style="color:var(--accent)"></i> Editar Material`;
      } else {
        document.getElementById("mat-codigo").value = Estoque.gerarProximoCodigoLivre();
        document.getElementById("modal-material-titulo").innerHTML = `<i data-lucide="package-plus" style="color:var(--accent)"></i> Cadastrar Material no Almoxarifado`;
      }

      CustomSelect.init("mat-categoria");
      CustomSelect.init("mat-unidade");
      document.getElementById("modalMaterial").classList.add("active");
      renderIcons();
    },

    salvarMaterial: () => {
      // Impede salvar se o número do item já existir
      const itemDuplicado = Estoque.verificarCodigoDuplicado();
      if (itemDuplicado) {
        return Utils.toast(`Não permitido: O Nº de item informado já pertence a "${itemDuplicado.nome}"!`, "error");
      }

      const id = document.getElementById("mat-id").value;
      const obj = {
        id: id || "MAT_" + Date.now(),
        codigo: document.getElementById("mat-codigo").value.trim(),
        nome: document.getElementById("mat-nome").value.trim(),
        categoria: document.getElementById("mat-categoria").value,
        qtd: parseFloat(document.getElementById("mat-qtd").value) || 0,
        unidade: document.getElementById("mat-unidade").value,
        minimo: parseFloat(document.getElementById("mat-minimo").value) || 0,
        local: document.getElementById("mat-local").value.trim(),
        deleted: false
      };

      DB.save("materiais", obj, () => {
        document.getElementById("modalMaterial").classList.remove("active");
        Utils.toast(id ? "Material atualizado!" : "Material adicionado à prateleira!");
        Estoque.render();
      });
    },

    enviarParaLixeira: (id) => {
      const m = state.materiais.find((x) => x.id === id);
      if (!m) return;
      m.deleted = true;
      DB.save("materiais", m, () => {
        Utils.toast(`"${m.nome}" enviado para a Lixeira.`);
        Estoque.render();
      });
    },

    abrirMovIndividual: (id, tipo = "SAIDA") => {
      const m = state.materiais.find((x) => x.id === id);
      if (!m) return;
      document.getElementById("form-mov-individual").reset();
      document.getElementById("ind-mat-id").value = m.id;
      document.getElementById("ind-tipo").value = tipo;

      const blocoSaida = document.getElementById("ind-bloco-saida");
      const inputSetor = document.getElementById("ind-setor");
      const inputResp = document.getElementById("ind-responsavel");
      const labelQtd = document.getElementById("ind-label-qtd");
      const selUnidade = document.getElementById("ind-unidade");
      const grupoUnidade = document.getElementById("ind-grupo-unidade");
      const boxConversao = document.getElementById("ind-box-conversao");
      const btn = document.getElementById("ind-btn-submit");

      selUnidade.value = m.unidade;
      CustomSelect.init("ind-unidade");
      CustomSelect.init("ind-modo-unidade");
      boxConversao.style.display = "none";

      document.getElementById("ind-resumo-box").innerHTML = `
        <span class="sku-badge">Nº ${m.codigo}</span> <strong style="color:white; font-size:15px; margin-left:6px;">${m.nome}</strong><br/>
        <span class="text-muted">Saldo atual na prateleira:</span> <strong style="color:var(--success)">${m.qtd} ${m.unidade}</strong>
      `;

      if (tipo === "SAIDA") {
        // Na baixa: Mostra Setor e Responsável, trava a unidade atual e só dá baixa (não baixa arquivo direto)
        document.getElementById("modal-mov-ind-titulo").innerHTML = `<i data-lucide="arrow-down-circle" style="color:var(--warning)"></i> Dar Baixa no Material`;
        blocoSaida.style.display = "block";
        inputSetor.setAttribute("required", "true");
        inputResp.setAttribute("required", "true");
        grupoUnidade.style.display = "none";
        labelQtd.textContent = `Quantidade de Saída (${m.unidade})`;
        labelQtd.style.color = "var(--warning)";
        btn.style.background = "var(--warning)";
        btn.style.color = "#000";
        btn.textContent = "Confirmar Baixa no Estoque";
      } else {
        // Na reposição: Tira a opção de responsável e pergunta a Unidade de Medida
        document.getElementById("modal-mov-ind-titulo").innerHTML = `<i data-lucide="plus-circle" style="color:var(--success)"></i> Repor Material no Estoque`;
        blocoSaida.style.display = "none";
        inputSetor.removeAttribute("required");
        inputResp.removeAttribute("required");
        grupoUnidade.style.display = "block";
        labelQtd.textContent = "Quantidade a Repor";
        labelQtd.style.color = "var(--success)";
        btn.style.background = "var(--success)";
        btn.style.color = "#000";
        btn.textContent = "Confirmar Reposição de Estoque";
      }

      document.getElementById("modalMovIndividual").classList.add("active");
      renderIcons();
      setTimeout(() => document.getElementById("ind-qtd").focus(), 100);
    },

    verificarMudancaUnidadeReposicao: () => {
      const id = document.getElementById("ind-mat-id").value;
      const tipo = document.getElementById("ind-tipo").value;
      const m = state.materiais.find((x) => x.id === id);
      if (!m || tipo !== "ENTRADA") return;

      const novaUnid = document.getElementById("ind-unidade").value;
      const box = document.getElementById("ind-box-conversao");
      if (novaUnid !== m.unidade) {
        box.style.display = "block";
        Estoque.alternarModoConversao();
      } else {
        box.style.display = "none";
      }
    },

    alternarModoConversao: () => {
      const modo = document.getElementById("ind-modo-unidade").value;
      const wrap = document.getElementById("ind-wrap-fator");
      wrap.style.display = modo === "CONVERTER_QTD" ? "block" : "none";
    },

    confirmarMovIndividual: () => {
      const id = document.getElementById("ind-mat-id").value;
      const tipo = document.getElementById("ind-tipo").value;
      const qtdInformada = parseFloat(document.getElementById("ind-qtd").value) || 0;
      const unidEscolhida = document.getElementById("ind-unidade").value;

      const m = state.materiais.find((x) => x.id === id);
      if (!m || qtdInformada <= 0) return;

      if (tipo === "SAIDA") {
        const setor = document.getElementById("ind-setor").value.trim();
        const resp = document.getElementById("ind-responsavel").value.trim();

        if (qtdInformada > m.qtd) {
          return Utils.toast(`Saldo insuficiente! Disponível: ${m.qtd} ${m.unidade}`, "error");
        }

        m.qtd = Number((m.qtd - qtdInformada).toFixed(2));

        const registroSaida = {
          id: "LOTE_" + Date.now(),
          data: Utils.hojeISO(),
          tipo: "SAIDA",
          setor,
          responsavel: resp,
          documento: "Baixa Individual",
          itens: [{ id: m.id, codigo: m.codigo, nome: m.nome, categoria: m.categoria, unidade: m.unidade, qtd: qtdInformada }]
        };

        DB.save("materiais", m, () => {
          DB.save("historico", registroSaida, () => {
            document.getElementById("modalMovIndividual").classList.remove("active");
            Utils.toast(`Baixa de ${qtdInformada} ${m.unidade} realizada! (Disponível no Histórico para gerar Word)`);
            Estoque.render();
            Historico.render();
          });
        });
      } else {
        // REPOSIÇÃO DE ESTOQUE (Sem responsável e tratando a unidade de medida)
        let qtdSomar = qtdInformada;
        let descricaoUnid = unidEscolhida;

        if (unidEscolhida !== m.unidade) {
          const modo = document.getElementById("ind-modo-unidade").value;
          if (modo === "ATUALIZAR_UNIDADE") {
            m.unidade = unidEscolhida;
          } else {
            const fator = parseFloat(document.getElementById("ind-fator-conversao").value) || 1;
            qtdSomar = Number((qtdInformada * fator).toFixed(2));
            descricaoUnid = `${m.unidade} (${qtdInformada} ${unidEscolhida} x ${fator})`;
          }
        }

        m.qtd = Number((m.qtd + qtdSomar).toFixed(2));

        const registroEntrada = {
          id: "LOTE_" + Date.now(),
          data: Utils.hojeISO(),
          tipo: "ENTRADA",
          setor: "Reposição de Almoxarifado",
          responsavel: "--",
          documento: `Entrada em ${unidEscolhida}`,
          itens: [{ id: m.id, codigo: m.codigo, nome: m.nome, categoria: m.categoria, unidade: descricaoUnid, qtd: qtdSomar }]
        };

        DB.save("materiais", m, () => {
          DB.save("historico", registroEntrada, () => {
            document.getElementById("modalMovIndividual").classList.remove("active");
            Utils.toast(`Estoque abastecido: +${qtdSomar} ${m.unidade}!`);
            Estoque.render();
            Historico.render();
          });
        });
      }
    },

    render: () => {
      const container = document.getElementById("shelf-grid-container");
      if (!container) return;

      const ativos = state.materiais.filter((m) => !m.deleted);
      const nivelFiltro = document.getElementById("filtro-nivel-estoque").value;
      const ordem = document.getElementById("filtro-ordenacao").value;
      const busca = state.termoBusca.toLowerCase();

      let volumeTotal = 0;
      let criticos = [];
      ativos.forEach((m) => {
        volumeTotal += parseFloat(m.qtd) || 0;
        if (m.qtd <= m.minimo) criticos.push(m);
      });

      const mesAtual = (new Date().getMonth() + 1).toString().padStart(2, "0");
      let saidasMes = 0;
      state.historico.forEach((h) => {
        if (h.tipo === "SAIDA" && (h.data || "").split("-")[1] === mesAtual) {
          (h.itens || []).forEach((it) => { saidasMes += parseFloat(it.qtd) || 0; });
        }
      });

      document.getElementById("kpi-total-itens").textContent = ativos.length;
      document.getElementById("kpi-volume-total").textContent = volumeTotal.toLocaleString("pt-BR");
      document.getElementById("kpi-criticos").textContent = criticos.length;
      document.getElementById("kpi-saidas-mes").textContent = saidasMes.toLocaleString("pt-BR");

      const banner = document.getElementById("banner-alerta-critico");
      if (criticos.length > 0) {
        banner.innerHTML = `
          <div class="card" style="margin-bottom: 18px; padding: 14px 20px; background: rgba(244,63,94,0.12); border-color: rgba(244,63,94,0.4); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <i data-lucide="flame" style="color: var(--danger);"></i>
              <span><strong style="color:white;">Alerta de Almoxarifado:</strong> ${criticos.length} item(ns) atingiram o estoque mínimo.</span>
            </div>
            <button class="btn btn-outline btn-sm" style="border-color: var(--warning); color: #fde047;" onclick="window.app.gerarWordReposicao()">
              <i data-lucide="file-text"></i> Gerar Word de Reposição (.doc)
            </button>
          </div>
        `;
      } else {
        banner.innerHTML = "";
      }

      let filtrados = ativos.filter((m) => {
        const matchCat = state.categoriaAtiva === "Todas" || m.categoria === state.categoriaAtiva;
        const isCrit = m.qtd <= m.minimo;
        const matchNivel = nivelFiltro === "Todos" || (nivelFiltro === "Critico" && isCrit) || (nivelFiltro === "Normal" && !isCrit);
        const matchBusca =
          !busca ||
          (m.nome || "").toLowerCase().includes(busca) ||
          (m.codigo || "").toLowerCase().includes(busca) ||
          (m.categoria || "").toLowerCase().includes(busca) ||
          (m.local || "").toLowerCase().includes(busca);
        return matchCat && matchNivel && matchBusca;
      });

      filtrados.sort((a, b) => {
        if (ordem === "nome") return a.nome.localeCompare(b.nome);
        if (ordem === "menor_saldo") return a.qtd - b.qtd;
        if (ordem === "maior_saldo") return b.qtd - a.qtd;
        return (a.codigo || "").localeCompare(b.codigo || "", undefined, { numeric: true });
      });

      container.innerHTML = "";

      if (filtrados.length === 0) {
        container.innerHTML = `
          <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 50px 20px;">
            <i data-lucide="package-search" style="width: 44px; height: 44px; color: var(--text-muted); margin-bottom: 10px;"></i>
            <h3 style="font-family: var(--font-display);">Nenhum material encontrado</h3>
            <p class="text-muted" style="margin-top: 4px;">Ajuste os filtros acima ou cadastre novos materiais.</p>
          </div>
        `;
        renderIcons();
        return;
      }

      filtrados.forEach((m) => {
        const isCrit = m.qtd <= m.minimo;
        const refMax = Math.max(m.qtd, m.minimo * 3, 1);
        const pct = Math.min(100, Math.round((m.qtd / refMax) * 100));
        const cor = isCrit ? "var(--danger)" : m.qtd <= m.minimo * 1.5 ? "var(--warning)" : "var(--success)";

        const card = document.createElement("div");
        card.className = `shelf-card ${isCrit ? "card-critico" : ""}`;
        card.innerHTML = `
          <div>
            <div class="shelf-top">
              <span class="sku-badge">Nº ${m.codigo || "--"}</span>
              <span class="cat-tag">${m.categoria}</span>
            </div>
            <h3 class="shelf-title">${m.nome}</h3>
            <p class="text-muted" style="font-size: 11.5px; margin-top: 4px;">
              <i data-lucide="map-pin" style="width: 12px; vertical-align: middle;"></i> ${m.local || "Almoxarifado Geral"}
            </p>

            <div class="shelf-gauge-box" style="margin-top: 12px;">
              <div class="gauge-numbers">
                <span class="text-muted" style="font-size: 11.5px;">Disponível:</span>
                <span class="gauge-Current" style="color: ${cor};">
                  ${m.qtd} <small style="font-size: 13px; color: var(--text-muted); font-weight: 600;">${m.unidade}</small>
                </span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                <span>Mínimo: ${m.minimo} ${m.unidade}</span>
                <span style="color: ${cor}; font-weight: 700;">${isCrit ? "⚠️ Repor" : "● OK"}</span>
              </div>
              <div class="gauge-bar-bg">
                <div class="gauge-bar-fill" style="width: ${pct}%; background: ${cor};"></div>
              </div>
            </div>
          </div>

          <div class="shelf-actions">
            <div class="quick-step-group">
              <button class="btn-step saida" onclick="window.app.abrirMovIndividual('${m.id}', 'SAIDA')" title="Dar baixa neste material">
                <i data-lucide="arrow-down-right" style="width: 14px;"></i> Dar Baixa
              </button>
              <button class="btn-step entrada" onclick="window.app.abrirMovIndividual('${m.id}', 'ENTRADA')" title="Repor material escolhendo a unidade">
                <i data-lucide="plus" style="width: 14px;"></i> Repor
              </button>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="btn-mini-icon" onclick="window.app.abrirModalMaterial('${m.id}')" title="Editar Material">
                <i data-lucide="pencil" style="width: 14px;"></i>
              </button>
              <button class="btn-mini-icon del" onclick="window.app.enviarParaLixeira('${m.id}')" title="Enviar para Lixeira">
                <i data-lucide="trash-2" style="width: 14px;"></i>
              </button>
            </div>
          </div>
        `;
        container.appendChild(card);
      });

      renderIcons();
    },

    atualizarGraficos: () => {
      if (!window.Chart) return;
      Chart.defaults.color = "#94a3b8";
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#6366f1";

      const consumoUnidade = {};
      state.historico.filter((h) => h.tipo === "SAIDA").forEach((h) => {
        const u = h.setor || "Outros";
        const soma = (h.itens || []).reduce((acc, it) => acc + (parseFloat(it.qtd) || 0), 0);
        consumoUnidade[u] = (consumoUnidade[u] || 0) + soma;
      });

      const porCat = {};
      state.materiais.filter((m) => !m.deleted).forEach((m) => {
        porCat[m.categoria] = (porCat[m.categoria] || 0) + (parseFloat(m.qtd) || 0);
      });

      if (state.charts.unidades) state.charts.unidades.destroy();
      const ctxU = document.getElementById("chart-unidades");
      if (ctxU) {
        const labels = Object.keys(consumoUnidade);
        const vals = Object.values(consumoUnidade);
        state.charts.unidades = new Chart(ctxU, {
          type: "bar",
          data: {
            labels: labels.length ? labels : ["Nenhuma saída registrada"],
            datasets: [{ data: vals.length ? vals : [0], backgroundColor: accent, borderRadius: 8 }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false } }, y: { grid: { color: "rgba(255,255,255,0.05)" }, beginAtZero: true } }
          }
        });
      }

      if (state.charts.categorias) state.charts.categorias.destroy();
      const ctxC = document.getElementById("chart-categorias");
      if (ctxC) {
        state.charts.categorias = new Chart(ctxC, {
          type: "doughnut",
          data: {
            labels: Object.keys(porCat),
            datasets: [{
              data: Object.values(porCat),
              backgroundColor: [accent, "#10b981", "#f59e0b", "#06b6d4", "#f43f5e", "#a855f7"],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "72%",
            plugins: { legend: { position: "right" } }
          }
        });
      }
    }
  };

  /* =========================================================
     9. BAIXA EM LOTE E GERAÇÃO DE ARQUIVOS WORD (.DOC)
     ========================================================= */
  const ListaSaidaWord = {
    abrirModal: () => {
      const ativos = state.materiais.filter((m) => !m.deleted);
      if (ativos.length === 0) {
        return Utils.toast("Cadastre pelo menos um material antes de registrar uma saída.", "error");
      }

      document.getElementById("pedido-setor").value = "";
      document.getElementById("pedido-responsavel").value = "";
      document.getElementById("pedido-documento").value = `Entrega ${Utils.formatDate(Utils.hojeISO())}`;
      document.getElementById("pedido-filtro-item").value = "";

      const chipsBox = document.getElementById("chips-unidades-destino");
      chipsBox.innerHTML = "";
      UNIDADES_RAPIDAS.forEach((nomeUnidade) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "unidade-chip";
        btn.textContent = nomeUnidade;
        btn.onclick = () => {
          document.querySelectorAll(".unidade-chip").forEach((c) => c.classList.remove("active"));
          btn.classList.add("active");
          document.getElementById("pedido-setor").value = nomeUnidade;
        };
        chipsBox.appendChild(btn);
      });

      const lista = document.getElementById("pedido-itens-lista");
      lista.innerHTML = "";
      ativos
        .sort((a, b) => (a.codigo || "").localeCompare(b.codigo || "", undefined, { numeric: true }))
        .forEach((m) => {
          const row = document.createElement("div");
          row.className = "pedido-item-row";
          row.dataset.busca = `${m.codigo} ${m.nome} ${m.categoria}`.toLowerCase();
          row.innerHTML = `
            <div class="font-mono" style="font-weight: 700; color: var(--accent);">Nº ${m.codigo || "-"}</div>
            <div style="font-weight: 600; color: white;">${m.nome}</div>
            <div><span class="cat-tag">${m.categoria}</span></div>
            <div style="text-align: center; color: ${m.qtd <= m.minimo ? "var(--danger)" : "var(--text-muted)"}; font-weight: 600;">
              ${m.qtd} ${m.unidade}
            </div>
            <div>
              <input
                type="number"
                step="0.01"
                min="0"
                max="${m.qtd}"
                class="input-modern qtd-saida-lote"
                style="padding: 6px 10px !important; text-align: center; border-color: var(--warning);"
                data-id="${m.id}"
                placeholder="0"
                oninput="window.app.calcularResumoModalSaida()"
              />
            </div>
          `;
          lista.appendChild(row);
        });

      ListaSaidaWord.calcularResumo();
      document.getElementById("modalGerarSaida").classList.add("active");
    },

    filtrarItens: () => {
      const termo = (document.getElementById("pedido-filtro-item").value || "").toLowerCase();
      document.querySelectorAll(".pedido-item-row").forEach((row) => {
        row.style.display = !termo || row.dataset.busca.includes(termo) ? "grid" : "none";
      });
    },

    calcularResumo: () => {
      let tipos = 0;
      let somaUnidades = 0;
      document.querySelectorAll(".qtd-saida-lote").forEach((inp) => {
        const v = parseFloat(inp.value) || 0;
        if (v > 0) {
          tipos++;
          somaUnidades += v;
        }
      });
      document.getElementById("pedido-contador-tipos").textContent = `${tipos} material(is) selecionado(s)`;
      document.getElementById("pedido-total-unidades").textContent = `${somaUnidades} Volume(s)`;
    },

    // Apenas dá a baixa no estoque e salva no Histórico (sem baixar arquivo direto)
    processarSaidaLote: () => {
      const setor = document.getElementById("pedido-setor").value.trim();
      const responsavel = document.getElementById("pedido-responsavel").value.trim() || "Servidor Designado";
      const documento = document.getElementById("pedido-documento").value.trim() || "Requisição Interna";

      if (!setor) {
        return Utils.toast("Selecione ou digite a Unidade Destino (Ex: CRAS, CREAS, Conselho Tutelar)!", "error");
      }

      const itensEscolhidos = [];
      let erroSaldo = null;

      document.querySelectorAll(".qtd-saida-lote").forEach((inp) => {
        const qtd = parseFloat(inp.value) || 0;
        if (qtd > 0) {
          const mat = state.materiais.find((m) => m.id === inp.dataset.id);
          if (mat) {
            if (qtd > mat.qtd) {
              erroSaldo = `O item "${mat.nome}" possui apenas ${mat.qtd} ${mat.unidade} disponível!`;
            }
            itensEscolhidos.push({
              id: mat.id,
              codigo: mat.codigo,
              nome: mat.nome,
              categoria: mat.categoria,
              unidade: mat.unidade,
              qtd
            });
          }
        }
      });

      if (erroSaldo) return Utils.toast(erroSaldo, "error");
      if (itensEscolhidos.length === 0) {
        return Utils.toast("Digite a quantidade de pelo menos 1 material na lista!", "error");
      }

      const registroLote = {
        id: "SAIDA_" + Date.now(),
        data: Utils.hojeISO(),
        tipo: "SAIDA",
        setor,
        responsavel,
        documento,
        itens: itensEscolhidos
      };

      itensEscolhidos.forEach((item) => {
        const mat = state.materiais.find((m) => m.id === item.id);
        if (mat) {
          mat.qtd = Math.max(0, Number((mat.qtd - item.qtd).toFixed(2)));
          DB.save("materiais", mat);
        }
      });

      DB.save("historico", registroLote, () => {
        document.getElementById("modalGerarSaida").classList.remove("active");
        Utils.toast(`Baixa registrada para ${setor}! Use a aba "Histórico de Saídas" quando quiser gerar o Word.`);
        Estoque.render();
        Historico.render();
      });
    },

    exportarDocumentoWord: (lote) => {
      let linhasHtml = "";
      let totalVolumes = 0;

      (lote.itens || []).forEach((it) => {
        totalVolumes += parseFloat(it.qtd) || 0;
        linhasHtml += `
          <tr>
            <td style="text-align: center; font-weight: bold;">${it.codigo || "-"}</td>
            <td><strong>${it.nome}</strong></td>
            <td style="text-align: center;">${it.categoria}</td>
            <td style="text-align: center;">${it.unidade}</td>
            <td style="text-align: center; font-weight: bold; font-size: 12pt;">${it.qtd}</td>
          </tr>
        `;
      });

      const htmlWord = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>Guia de Saída de Material</title>
          <style>
            body { font-family: 'Calibri', 'Arial', sans-serif; color: #000; }
            .header-box { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 18px; }
            h1 { font-size: 15pt; margin: 0; text-transform: uppercase; }
            h2 { font-size: 11pt; margin: 4px 0 0; color: #333; font-weight: normal; }
            h3 { font-size: 13pt; margin-top: 12px; text-decoration: underline; text-transform: uppercase; }
            .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
            .meta-table td { padding: 6px 8px; border: 1px solid #94a3b8; font-size: 10.5pt; }
            .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            .items-table th, .items-table td { border: 1px solid #000; padding: 8px; font-size: 10.5pt; }
            .items-table th { background-color: #e2e8f0; font-weight: bold; text-transform: uppercase; }
            .total-row { background-color: #f1f5f9; font-weight: bold; font-size: 11.5pt; }
          </style>
        </head>
        <body>
          <div class="header-box">
            <h1>SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL</h1>
            <h2>Coordenação de Almoxarifado, Patrimônio e Suprimentos - FMAS</h2>
            <h3>GUIA DE ENTREGA / SAÍDA DE MATERIAIS</h3>
          </div>

          <table class="meta-table">
            <tr>
              <td style="width: 55%;"><strong>UNIDADE / SETOR DESTINO:</strong> ${lote.setor}</td>
              <td style="width: 45%;"><strong>DATA DA ENTREGA:</strong> ${Utils.formatDate(lote.data)}</td>
            </tr>
            <tr>
              <td><strong>RECEBIDO POR (SOLICITANTE):</strong> ${lote.responsavel || "_______________________"}</td>
              <td><strong>DOCUMENTO / REFERÊNCIA:</strong> ${lote.documento || lote.id}</td>
            </tr>
          </table>

          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 12%;">Nº Item</th>
                <th style="width: 46%;">Especificação do Material</th>
                <th style="width: 18%;">Categoria</th>
                <th style="width: 12%;">Unid.</th>
                <th style="width: 12%;">Qtd. Entregue</th>
              </tr>
            </thead>
            <tbody>
              ${linhasHtml}
              <tr class="total-row">
                <td colspan="4" style="text-align: right;">TOTAL DE VOLUMES ENTREGUES:</td>
                <td style="text-align: center;">${totalVolumes}</td>
              </tr>
            </tbody>
          </table>

          <p style="font-size: 10pt; margin-top: 20px; text-align: justify;">
            Declaro ter recebido do Almoxarifado da Secretaria Municipal de Assistência Social os materiais acima relacionados, destinados à manutenção das atividades da unidade <strong>${lote.setor}</strong>.
          </p>

          <br/><br/>
          <table style="width: 100%; border: none; margin-top: 35px; text-align: center;">
            <tr>
              <td style="width: 48%; border: none;">
                ___________________________________________________<br/>
                <strong>${lote.responsavel || "Assinatura do Solicitante / Recebedor"}</strong><br/>
                <span style="font-size: 9.5pt; color: #444;">Unidade: ${lote.setor}</span>
              </td>
              <td style="width: 4%; border: none;"></td>
              <td style="width: 48%; border: none;">
                ___________________________________________________<br/>
                <strong>Coordenação de Almoxarifado</strong><br/>
                <span style="font-size: 9.5pt; color: #444;">Secretaria Municipal de Assistência Social</span>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      const nomeLimpo = lote.setor.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 18);
      Utils.solicitarSalvamentoWord(`Guia_Saida_${nomeLimpo}_${lote.data}`, htmlWord);
    },

    gerarWordReposicao: () => {
      const criticos = state.materiais.filter((m) => !m.deleted && m.qtd <= m.minimo);
      if (criticos.length === 0) {
        return Utils.toast("Nenhum material está abaixo do estoque mínimo no momento.");
      }

      let linhas = "";
      criticos.forEach((m) => {
        const sugerido = Math.max(m.minimo * 2 - m.qtd, m.minimo);
        linhas += `
          <tr>
            <td style="text-align: center;">${m.codigo || "-"}</td>
            <td><strong>${m.nome}</strong></td>
            <td style="text-align: center;">${m.categoria}</td>
            <td style="text-align: center; color: #b91c1c; font-weight: bold;">${m.qtd} ${m.unidade}</td>
            <td style="text-align: center;">${m.minimo} ${m.unidade}</td>
            <td style="text-align: center; font-weight: bold;">+${sugerido} ${m.unidade}</td>
          </tr>
        `;
      });

      const htmlWord = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>Lista de Reposição de Estoque</title></head>
        <body style="font-family: Calibri, Arial, sans-serif;">
          <h2 style="text-align:center; margin-bottom: 4px;">SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL</h2>
          <h3 style="text-align:center; margin-top: 0; color: #444;">SOLICITAÇÃO DE COMPRA / REPOSIÇÃO DE ESTOQUE CRÍTICO</h3>
          <p><strong>Data do Levantamento:</strong> ${Utils.formatDate(Utils.hojeISO())}</p>
          <table style="width:100%; border-collapse: collapse;" border="1" cellpadding="7">
            <thead style="background:#f1f5f9;">
              <tr>
                <th>Código</th>
                <th>Descrição do Material</th>
                <th>Categoria</th>
                <th>Saldo Atual</th>
                <th>Estoque Mínimo</th>
                <th>Sugestão de Compra</th>
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
        </body>
        </html>
      `;

      Utils.solicitarSalvamentoWord(`Lista_Reposicao_Estoque_${Utils.hojeISO()}`, htmlWord);
    }
  };

  /* =========================================================
     10. HISTÓRICO DE SAÍDAS + GERADOR WORD POR MÊS/ANO/TODOS
     ========================================================= */
  const Historico = {
    initFilters: () => {
      const fM = document.getElementById("hist-mes");
      const fA = document.getElementById("hist-ano");
      fM.innerHTML = '<option value="Todos">Todos os Meses</option>';
      [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
      ].forEach((m, i) => {
        fM.innerHTML += `<option value="${(i + 1).toString().padStart(2, "0")}">${m}</option>`;
      });
      fA.innerHTML = '<option value="Todos">Todos os Anos</option>';
      for (let y = 2024; y <= 2030; y++) {
        fA.innerHTML += `<option value="${y}" ${y === new Date().getFullYear() ? "selected" : ""}>${y}</option>`;
      }
      CustomSelect.init("hist-mes");
      CustomSelect.init("hist-ano");
    },

    obterListaFiltrada: (apenasSaidas = false) => {
      const mes = document.getElementById("hist-mes").value;
      const ano = document.getElementById("hist-ano").value;
      const busca = (document.getElementById("hist-busca").value || "").toLowerCase();

      return state.historico
        .filter((h) => {
          if (apenasSaidas && h.tipo !== "SAIDA") return false;
          const [hA, hM] = (h.data || "").split("-");
          const matchM = mes === "Todos" || hM === mes;
          const matchA = ano === "Todos" || hA === ano;
          const textoItens = (h.itens || []).map((i) => i.nome).join(" ").toLowerCase();
          const matchB =
            !busca ||
            (h.setor || "").toLowerCase().includes(busca) ||
            (h.responsavel || "").toLowerCase().includes(busca) ||
            textoItens.includes(busca);
          return matchM && matchA && matchB;
        })
        .sort((a, b) => b.id.localeCompare(a.id));
    },

    render: () => {
      const container = document.getElementById("lista-historico-container");
      if (!container) return;

      const lista = Historico.obterListaFiltrada(false);
      container.innerHTML = "";

      if (lista.length === 0) {
        container.innerHTML = `
          <div class="card" style="text-align: center; padding: 45px;">
            <p class="text-muted">Nenhuma movimentação encontrada para o filtro selecionado.</p>
          </div>
        `;
        return;
      }

      lista.forEach((h) => {
        const isSaida = h.tipo === "SAIDA";
        const resumoItens = (h.itens || []).map((i) => `<span class="sku-badge">${i.qtd} ${i.unidade} • ${i.nome}</span>`).join(" ");

        const div = document.createElement("div");
        div.className = "history-card";
        div.style.borderLeftColor = isSaida ? "var(--warning)" : "var(--success)";
        div.innerHTML = `
          <div style="flex: 1; min-width: 260px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap;">
              <span class="font-mono" style="font-size: 12px; color: var(--text-muted);">${Utils.formatDate(h.data)}</span>
              <span style="font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 6px; background: rgba(255,255,255,0.06); color: ${isSaida ? "var(--warning)" : "var(--success)"};">
                ${isSaida ? "SAÍDA / ENTREGA" : "ENTRADA / REPOSIÇÃO"}
              </span>
              <strong style="font-size: 16px; color: white;">${h.setor}</strong>
              ${isSaida ? `<span style="font-size: 11px; color: var(--info);">Recebido por: ${h.responsavel}</span>` : ""}
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
              ${resumoItens}
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            ${
              isSaida
                ? `<button class="btn btn-outline btn-sm" style="border-color: var(--success); color: var(--success);" onclick="window.app.reemitirWord('${h.id}')">
                    <i data-lucide="file-text"></i> Gerar Word (.doc)
                   </button>`
                : ""
            }
            <button class="btn-mini-icon del" onclick="window.app.excluirHistorico('${h.id}')" title="Estornar e Excluir">
              <i data-lucide="trash-2" style="width: 14px;"></i>
            </button>
          </div>
        `;
        container.appendChild(div);
      });
      renderIcons();
    },

    // Gera um documento Word (.doc) consolidado das Saídas Filtradas (Mês, Ano, Todos os Meses, Todos os Anos)
    gerarWordFiltrado: () => {
      const saidas = Historico.obterListaFiltrada(true);
      if (saidas.length === 0) {
        return Utils.toast("Não há saídas registradas para o filtro de Mês/Ano atual!", "error");
      }

      const mes = document.getElementById("hist-mes").value;
      const ano = document.getElementById("hist-ano").value;
      const nomeMes = mes === "Todos" ? "TODOS OS MESES" : Utils.getMonthName(mes).toUpperCase();
      const nomeAno = ano === "Todos" ? "TODOS OS ANOS" : ano;

      let linhas = "";
      let totalVolumes = 0;

      saidas.forEach((h) => {
        (h.itens || []).forEach((it) => {
          totalVolumes += parseFloat(it.qtd) || 0;
          linhas += `
            <tr>
              <td style="text-align: center;">${Utils.formatDate(h.data)}</td>
              <td><strong>${h.setor}</strong></td>
              <td>${h.responsavel || "-"}</td>
              <td style="text-align: center;">${it.codigo || "-"}</td>
              <td>${it.nome}</td>
              <td style="text-align: center; font-weight: bold;">${it.qtd} ${it.unidade}</td>
            </tr>
          `;
        });
      });

      const htmlWord = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>Relatório de Saídas de Materiais</title>
          <style>
            body { font-family: Calibri, Arial, sans-serif; color: #000; }
            h2, h3, h4 { text-align: center; margin: 4px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 14px; }
            th, td { border: 1px solid #000; padding: 7px; font-size: 10pt; }
            th { background-color: #e2e8f0; font-weight: bold; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <h2>SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL</h2>
          <h3>RELATÓRIO CONSOLIDADO DE SAÍDAS DE MATERIAIS DO ALMOXARIFADO</h3>
          <h4>PERÍODO FILTRADO: ${nomeMes} / ${nomeAno}</h4>

          <table>
            <thead>
              <tr>
                <th style="width: 12%;">Data</th>
                <th style="width: 22%;">Unidade / Setor</th>
                <th style="width: 18%;">Solicitante</th>
                <th style="width: 8%;">Nº Item</th>
                <th style="width: 28%;">Material Entregue</th>
                <th style="width: 12%;">Quantidade</th>
              </tr>
            </thead>
            <tbody>
              ${linhas}
              <tr style="background-color: #f1f5f9; font-weight: bold;">
                <td colspan="5" style="text-align: right;">TOTAL GERAL DE VOLUMES ENTREGUES NO PERÍODO:</td>
                <td style="text-align: center;">${totalVolumes}</td>
              </tr>
            </tbody>
          </table>
        </body>
        </html>
      `;

      Utils.solicitarSalvamentoWord(`Saidas_Almoxarifado_${nomeMes.replace(/\s+/g, "_")}_${nomeAno}`, htmlWord);
    },

    reemitirWord: (id) => {
      const h = state.historico.find((x) => x.id === id);
      if (h) ListaSaidaWord.exportarDocumentoWord(h);
    },

    excluirHistorico: (id) => {
      const h = state.historico.find((x) => x.id === id);
      if (!h) return;
      if (confirm("Deseja excluir este registro e estornar as quantidades no estoque?")) {
        (h.itens || []).forEach((it) => {
          const mat = state.materiais.find((m) => m.id === it.id || m.nome === it.nome);
          if (mat) {
            mat.qtd = h.tipo === "SAIDA" ? Number((mat.qtd + it.qtd).toFixed(2)) : Math.max(0, Number((mat.qtd - it.qtd).toFixed(2)));
            DB.save("materiais", mat);
          }
        });
        DB.delete("historico", id, () => {
          Utils.toast("Movimentação estornada!");
          Estoque.render();
          Historico.render();
        });
      }
    }
  };

  /* =========================================================
     11. RELATÓRIOS A4 + BOTÃO WORD DINÂMICO POR OPÇÃO
     ========================================================= */
  const RelatoriosA4 = {
    render: () => {
      const tipo = document.getElementById("rel-tipo").value;
      const wrap = document.getElementById("print-tabela-wrap");
      const btnWord = document.getElementById("btn-word-relatorio-dinamico");
      document.getElementById("print-data").textContent = `Emitido em: ${new Date().toLocaleDateString("pt-BR")}`;

      const ativos = state.materiais.filter((m) => !m.deleted);

      // Atualiza o texto do botão Word conforme a opção selecionada
      if (btnWord) {
        if (tipo === "HISTORICO_SAIDAS") {
          btnWord.innerHTML = `<i data-lucide="file-text"></i> Gerar Word: Relatório de Saídas (.doc)`;
        } else if (tipo === "ESTOQUE_GERAL") {
          btnWord.innerHTML = `<i data-lucide="file-text"></i> Gerar Word: Estoque Completo (.doc)`;
        } else {
          btnWord.innerHTML = `<i data-lucide="file-text"></i> Gerar Word: Materiais em Falta (.doc)`;
        }
        renderIcons(btnWord);
      }

      if (tipo === "ESTOQUE_GERAL" || tipo === "ESTOQUE_CRITICO") {
        const lista = tipo === "ESTOQUE_CRITICO" ? ativos.filter((m) => m.qtd <= m.minimo) : ativos;
        document.getElementById("print-titulo").textContent =
          tipo === "ESTOQUE_CRITICO" ? "RELATÓRIO DE MATERIAIS COM ESTOQUE CRÍTICO" : "POSIÇÃO GERAL DE ESTOQUE DO ALMOXARIFADO";

        let rows = "";
        lista.forEach((m) => {
          rows += `
            <tr>
              <td style="text-align:center;">${m.codigo || "-"}</td>
              <td><strong>${m.nome}</strong></td>
              <td>${m.categoria}</td>
              <td>${m.local || "-"}</td>
              <td style="text-align:center;">${m.minimo} ${m.unidade}</td>
              <td style="text-align:center; font-weight:bold;">${m.qtd} ${m.unidade}</td>
            </tr>
          `;
        });
        wrap.innerHTML = `
          <table class="print-table">
            <thead>
              <tr><th>Código</th><th>Material</th><th>Categoria</th><th>Local</th><th>Mínimo</th><th>Saldo Atual</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="6" style="text-align:center;">Nenhum registro encontrado.</td></tr>'}</tbody>
          </table>
        `;
      } else {
        document.getElementById("print-titulo").textContent = "RELATÓRIO GERAL DE SAÍDAS E ENTREGAS POR UNIDADE";
        let rows = "";
        state.historico.filter((h) => h.tipo === "SAIDA").forEach((h) => {
          const desc = (h.itens || []).map((i) => `${i.qtd} ${i.unidade} ${i.nome}`).join(", ");
          rows += `
            <tr>
              <td style="text-align:center;">${Utils.formatDate(h.data)}</td>
              <td><strong>${h.setor}</strong></td>
              <td>${h.responsavel || "-"}</td>
              <td>${desc}</td>
            </tr>
          `;
        });
        wrap.innerHTML = `
          <table class="print-table">
            <thead>
              <tr><th>Data</th><th>Unidade / Destino</th><th>Recebedor</th><th>Materiais Entregues</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="4" style="text-align:center;">Nenhuma saída registrada.</td></tr>'}</tbody>
          </table>
        `;
      }
    },

    // Gera o arquivo Word (.doc) exatamente da opção que está selecionada na tela de Relatórios
    gerarWordOpcaoAtual: () => {
      const tipo = document.getElementById("rel-tipo").value;
      const titulo = document.getElementById("print-titulo").textContent;
      const tabelaHtml = document.getElementById("print-tabela-wrap").innerHTML;

      const htmlWord = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>${titulo}</title>
          <style>
            body { font-family: Calibri, Arial, sans-serif; color: #000; }
            h2, h3 { text-align: center; margin: 4px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 14px; }
            th, td { border: 1px solid #000; padding: 7px; font-size: 10pt; }
            th { background-color: #e2e8f0; font-weight: bold; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <h2>SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL</h2>
          <h3>${titulo}</h3>
          <p style="text-align:center; font-size:10pt;">Emitido em: ${new Date().toLocaleDateString("pt-BR")}</p>
          ${tabelaHtml}
        </body>
        </html>
      `;

      const mapNome = {
        HISTORICO_SAIDAS: `Relatorio_Saidas_${Utils.hojeISO()}`,
        ESTOQUE_GERAL: `Estoque_Completo_${Utils.hojeISO()}`,
        ESTOQUE_CRITICO: `Materiais_Criticos_${Utils.hojeISO()}`
      };

      Utils.solicitarSalvamentoWord(mapNome[tipo] || "Relatorio_Almoxarifado", htmlWord);
    }
  };

  /* =========================================================
     12. CENTRAL DE UTILITÁRIOS (VOZ, BACKUP, CSV, LIXEIRA)
     ========================================================= */
  const Utilitarios = {
    abrirModal: () => {
      const lixeira = document.getElementById("lista-lixeira");
      const apagados = state.materiais.filter((m) => m.deleted);
      lixeira.innerHTML = apagados.length
        ? apagados.map((m) => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:6px 10px; border-radius:8px; font-size:12px;">
              <span>${m.nome}</span>
              <button class="btn btn-outline btn-sm" style="padding:3px 8px;" onclick="window.app.restaurarItem('${m.id}')">Restaurar</button>
            </div>
          `).join("")
        : `<span class="text-muted" style="font-size:12px;">Lixeira vazia.</span>`;

      document.getElementById("modalUtilitarios").classList.add("active");
      renderIcons();
    },

    restaurarItem: (id) => {
      const m = state.materiais.find((x) => x.id === id);
      if (m) {
        m.deleted = false;
        DB.save("materiais", m, () => {
          Utils.toast("Material restaurado para a prateleira!");
          Utilitarios.abrirModal();
          Estoque.render();
        });
      }
    },

    exportBackup: () => {
      const data = JSON.stringify({
        categorias: state.categorias,
        materiais: state.materiais,
        historico: state.historico
      }, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Backup_Almoxarifado_${Utils.hojeISO()}.json`;
      a.click();
      Utils.toast("Backup JSON exportado!");
    },

    importBackup: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        if (obj.categorias && Array.isArray(obj.categorias)) {
          state.categorias = obj.categorias;
          Categorias.salvarLocal();
        }
        const tx = state.db.transaction(["materiais", "historico"], "readwrite");
        (obj.materiais || []).forEach((m) => tx.objectStore("materiais").put(m));
        (obj.historico || []).forEach((h) => tx.objectStore("historico").put(h));
        tx.oncomplete = () => {
          DB.load(() => {
            Categorias.renderPillsESelects();
            Estoque.render();
            Historico.render();
            Utils.toast("Backup restaurado com sucesso!");
          });
        };
      } catch (err) {
        Utils.toast("Arquivo de backup inválido.", "error");
      }
      e.target.value = "";
    },

    exportarCSV: () => {
      let csv = "\ufeffCodigo;Material;Categoria;Quantidade Atual;Unidade;Estoque Minimo;Localizacao\n";
      state.materiais.filter((m) => !m.deleted).forEach((m) => {
        csv += `"${m.codigo}";"${m.nome}";"${m.categoria}";"${m.qtd}";"${m.unidade}";"${m.minimo}";"${m.local || ""}"\n`;
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Estoque_Almoxarifado_${Utils.hojeISO()}.csv`;
      a.click();
      Utils.toast("Planilha CSV gerada para o Excel!");
    },

    ouvirVoz: () => {
      const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Speech) {
        const falado = prompt("🎙️ Digite o que deseja buscar (Ex: Papel A4, Limpeza):");
        if (falado !== null) App.pesquisaGlobal(falado);
        return;
      }
      const rec = new Speech();
      rec.lang = "pt-BR";
      const btn = document.getElementById("btn-voice-search");
      rec.onstart = () => { btn.classList.add("listening"); Utils.toast("🎙️ Ouvindo... Diga o nome do material ou categoria!"); };
      rec.onend = () => btn.classList.remove("listening");
      rec.onresult = (e) => {
        const txt = e.results[0][0].transcript;
        document.getElementById("global-search").value = txt;
        App.pesquisaGlobal(txt);
        Utils.toast(`🗣️ Filtrando por: "${txt}"`);
      };
      rec.start();
    }
  };

  return {
    init: () => {
      aplicarZoom(0);
      Security.init();
      Personalizacao.init();
      Categorias.renderPillsESelects();
      Historico.initFilters();

      // Inicializa os selects customizados da Prateleira e Relatórios
      CustomSelect.init("filtro-nivel-estoque");
      CustomSelect.init("filtro-ordenacao");
      CustomSelect.init("rel-tipo");

      DB.init(() => {
        Estoque.render();
        Historico.render();
        RelatoriosA4.render();
      });
      renderIcons();
    },
    unlock: Security.unlock,
    logout: Security.logout,
    navigate: (id) => {
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      document.getElementById(id)?.classList.add("active");
      document.querySelectorAll(".dock-pill").forEach((p) => p.classList.toggle("active", p.dataset.target === id));
      if (id === "view-estoque") Estoque.render();
      if (id === "view-historico") Historico.render();
      if (id === "view-painel") Estoque.atualizarGraficos();
      if (id === "view-relatorios") RelatoriosA4.render();
    },
    selecionarCategoria: (cat) => {
      state.categoriaAtiva = cat;
      Categorias.renderPillsESelects();
      Estoque.render();
    },
    abrirModalCategorias: Categorias.abrirModal,
    adicionarCategoria: Categorias.adicionar,
    removerCategoria: Categorias.remover,
    pesquisaGlobal: (val) => {
      state.termoBusca = val || "";
      App.navigate("view-estoque");
    },
    filtrarStatusRapido: (status) => {
      const sel = document.getElementById("filtro-nivel-estoque");
      sel.value = status;
      CustomSelect.init("filtro-nivel-estoque");
      Estoque.render();
    },
    verificarCodigoDuplicado: Estoque.verificarCodigoDuplicado,
    abrirModalMaterial: Estoque.abrirModalMaterial,
    salvarMaterial: Estoque.salvarMaterial,
    enviarParaLixeira: Estoque.enviarParaLixeira,
    abrirMovIndividual: Estoque.abrirMovIndividual,
    verificarMudancaUnidadeReposicao: Estoque.verificarMudancaUnidadeReposicao,
    alternarModoConversao: Estoque.alternarModoConversao,
    confirmarMovIndividual: Estoque.confirmarMovIndividual,
    renderEstoque: Estoque.render,
    abrirModalListaSaida: ListaSaidaWord.abrirModal,
    filtrarItensModalSaida: ListaSaidaWord.filtrarItens,
    calcularResumoModalSaida: ListaSaidaWord.calcularResumo,
    processarSaidaLote: ListaSaidaWord.processarSaidaLote,
    gerarWordReposicao: ListaSaidaWord.gerarWordReposicao,
    renderHistorico: Historico.render,
    gerarWordHistoricoFiltrado: Historico.gerarWordFiltrado,
    reemitirWord: Historico.reemitirWord,
    excluirHistorico: Historico.excluirHistorico,
    renderRelatorioA4: RelatoriosA4.render,
    gerarWordRelatorioAtual: RelatoriosA4.gerarWordOpcaoAtual,
    confirmarGravacaoWord: Utils.confirmarGravacaoWord,
    abrirUtilitarios: Utilitarios.abrirModal,
    restaurarItem: Utilitarios.restaurarItem,
    exportBackup: Utilitarios.exportBackup,
    importBackup: Utilitarios.importBackup,
    exportarCSV: Utilitarios.exportarCSV,
    ouvirVoz: Utilitarios.ouvirVoz,
    setTheme: Personalizacao.setTheme,
    uploadLogo: Personalizacao.uploadLogo,
    uploadBg: Personalizacao.uploadBg,
    resetVisual: Personalizacao.resetVisual,
    aplicarZoom: aplicarZoom,
  };
})();

window.app = App;
document.addEventListener("DOMContentLoaded", App.init);