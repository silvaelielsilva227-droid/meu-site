/* =========================================================
   1. UTILITÁRIOS DE ZOOM E ATALHOS DE TECLADO (F11, CTRL+K, ESC)
   ========================================================= */
let nivelZoom = 0;
function aplicarZoom(mudanca, salvarNaNuvem = true) {
  nivelZoom = Math.min(3, Math.max(-2, nivelZoom + mudanca));
  if (typeof nw !== "undefined") {
    nw.Window.get().zoomLevel = nivelZoom;
  } else {
    document.body.style.zoom = 1 + nivelZoom * 0.08;
  }

  const uidAtivo = window.firebaseCloud?.auth?.currentUser?.uid;
  if (salvarNaNuvem && window.firebaseCloud && uidAtivo) {
    window.firebaseCloud.guardarConfig(uidAtivo, "zoom", nivelZoom);
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

const App = (() => {
  // O ID da conta vem 100% do Firebase Authentication (isolado por conta e não por aparelho)
  let USER_UID = null;

  const UNIDADES_RAPIDAS = [
    "CRAS",
    "CREAS",
    "Centro de Qualificação",
    "Conselho Tutelar",
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

  const state = {
    materiais: [],
    historico: [],
    categorias: [...CATEGORIAS_INICIAIS],
    categoriaAtiva: "Todas",
    termoBusca: "",
    wordPendenteHtml: "",
    charts: { unidades: null, categorias: null }
  };
  // 3. Carrega as categorias exclusivas deste usuário
  try {
    const salvas = localStorage.getItem(CHAVE_CATEGORIAS_USUARIO);
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
     5. BANCO DE DADOS 100% NA NUVEM (FIREBASE POR CONTA)
     ========================================================= */
  const DB = {
    init: (cb) => {
      // Aguarda o Firebase Authentication identificar qual conta está logada
      let tentativas = 0;
      const aguardarPonte = setInterval(() => {
        tentativas++;
        if (window.firebaseCloud) {
          clearInterval(aguardarPonte);
          window.firebaseCloud.onChange((user) => {
            if (!user) {
              // Se não estiver logado em nenhuma conta, envia para a tela de login
              window.location.href = "login.html";
              return;
            }

            USER_UID = user.uid;

            // Escuta e sincroniza 100% da pasta exclusiva desta conta no Firebase
            window.firebaseCloud.escutarTempoReal(USER_UID, (dadosNuvem) => {
              state.materiais = dadosNuvem.materiais ? Object.values(dadosNuvem.materiais) : [];
              state.historico = dadosNuvem.historico ? Object.values(dadosNuvem.historico) : [];

              if (dadosNuvem.categorias && Array.isArray(dadosNuvem.categorias)) {
                state.categorias = dadosNuvem.categorias;
              } else {
                state.categorias = [...CATEGORIAS_INICIAIS];
              }

              // Aplica a foto de perfil/logo, tema, papel de parede e zoom salvos na conta
              Personalizacao.aplicarConfigs(dadosNuvem.configuracoes || {});

              Categorias.renderPillsESelects();
              Estoque.render();
              Historico.render();
              RelatoriosA4.render();
              Estoque.atualizarGraficos();
            });

            if (cb) cb();
          });
        } else if (tentativas > 50) {
          clearInterval(aguardarPonte);
          Utils.toast("Erro ao conectar com o servidor Firebase.", "error");
        }
      }, 100);
    },

    save: async (store, obj, cb) => {
      const arr = state[store];
      const i = arr.findIndex((x) => x.id === obj.id);
      if (i > -1) arr[i] = obj;
      else arr.push(obj);

      if (window.firebaseCloud && USER_UID) {
        try {
          await window.firebaseCloud.guardarItem(USER_UID, store, obj);
        } catch (e) {
          Utils.toast("Erro ao salvar na nuvem do Firebase.", "error");
        }
      }
      if (cb) cb();
    },

    delete: async (store, id, cb) => {
      state[store] = state[store].filter((x) => x.id !== id);

      if (window.firebaseCloud && USER_UID) {
        try {
          await window.firebaseCloud.apagarItem(USER_UID, store, id);
        } catch (e) {
          Utils.toast("Erro ao remover item da nuvem.", "error");
        }
      }
      if (cb) cb();
    }
  };

  /* =========================================================
     6. GESTÃO DE CATEGORIAS DINÂMICAS (SALVAS NA CONTA)
     ========================================================= */
  const Categorias = {
    salvarLocal: () => {
      if (window.firebaseCloud && USER_UID) {
        window.firebaseCloud.guardarCategorias(USER_UID, state.categorias);
      }
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
    init: () => {},
    logout: async () => {
      if (window.firebaseCloud) {
        await window.firebaseCloud.encerrarSessao();
      }
      Utils.toast("Sessão encerrada.");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 800);
    }
  };

  const Personalizacao = {
    init: () => {},

    aplicarConfigs: (configs) => {
      if (!configs) return;

      // 1. Tema salvo na conta
      const tema = configs.tema || "indigo";
      const paletas = {
        indigo: { m: "#6366f1", g: "rgba(99,102,241,0.25)" },
        emerald: { m: "#10b981", g: "rgba(16,185,129,0.25)" },
        ruby: { m: "#f43f5e", g: "rgba(244,63,94,0.25)" },
        gold: { m: "#f59e0b", g: "rgba(245,158,11,0.25)" },
        ocean: { m: "#0ea5e9", g: "rgba(14,165,233,0.25)" },
        neon: { m: "#d946ef", g: "rgba(217,70,239,0.25)" }
      };
      if (paletas[tema]) {
        document.documentElement.style.setProperty("--accent", paletas[tema].m);
        document.documentElement.style.setProperty("--accent-glow", paletas[tema].g);
        document.querySelectorAll(".theme-btn").forEach((b) => b.classList.toggle("active", b.dataset.theme === tema));
      }

      // 2. Zoom salvo na conta
      if (configs.zoom !== undefined) {
        nivelZoom = parseFloat(configs.zoom);
        aplicarZoom(0, false);
      }

      // 3. Foto de Perfil / Logo salva na conta
      document.querySelectorAll(".white-label-target").forEach((el) => {
        if (configs.logo) {
          el.innerHTML = `<img src="${configs.logo}" style="width:100%;height:100%;object-fit:contain;border-radius:12px;" />`;
          el.style.background = "transparent";
        } else {
          el.innerHTML = `<i data-lucide="boxes"></i>`;
          el.style.background = "";
        }
      });
      renderIcons();

      // 4. Papel de Parede salvo na conta
      const vid = document.getElementById("bg-video");
      if (!configs.bg) {
        document.body.classList.remove("custom-bg");
        document.body.style.backgroundImage = "";
        if (vid) { vid.style.display = "none"; vid.src = ""; }
      } else {
        document.body.classList.add("custom-bg");
        if (configs.bgType === "video") {
          document.body.style.backgroundImage = "none";
          if (vid) { vid.src = configs.bg; vid.style.display = "block"; }
        } else {
          if (vid) { vid.style.display = "none"; vid.src = ""; }
          document.body.style.backgroundImage = `url('${configs.bg}')`;
        }
      }
    },

    setTheme: (nome) => {
      Personalizacao.aplicarConfigs({ tema: nome });
      if (window.firebaseCloud && USER_UID) {
        window.firebaseCloud.guardarConfig(USER_UID, "tema", nome);
      }
      Estoque.atualizarGraficos();
    },

    uploadLogo: (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = async (ev) => {
        const base64Logo = ev.target.result;
        Personalizacao.aplicarConfigs({ logo: base64Logo });
        if (window.firebaseCloud && USER_UID) {
          await window.firebaseCloud.guardarConfig(USER_UID, "logo", base64Logo);
          Utils.toast("Foto/Logo salva na sua conta e sincronizada com o Login!");
        }
      };
      r.readAsDataURL(f);
    },

    uploadBg: (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const isVid = f.type.startsWith("video/");
      const r = new FileReader();
      r.onload = async (ev) => {
        Personalizacao.aplicarConfigs({ bg: ev.target.result, bgType: isVid ? "video" : "image" });
        if (window.firebaseCloud && USER_UID) {
          await window.firebaseCloud.guardarConfig(USER_UID, "bg", ev.target.result);
          await window.firebaseCloud.guardarConfig(USER_UID, "bgType", isVid ? "video" : "image");
          Utils.toast("Papel de parede salvo na sua conta!");
        }
      };
      r.readAsDataURL(f);
    },

    resetVisual: async () => {
      Personalizacao.aplicarConfigs({ logo: null, bg: null, bgType: null });
      if (window.firebaseCloud && USER_UID) {
        await window.firebaseCloud.guardarConfig(USER_UID, "logo", null);
        await window.firebaseCloud.guardarConfig(USER_UID, "bg", null);
      }
      Utils.toast("Visual padrão restaurado na conta.");
    }
  };
  

  const Estoque = {
    materialInspecionadoId: null,

    // Garante que todo material tenha a lista individual de cada Fardo/Caixa e suas unidades internas
    sincronizarVolumes: (m) => {
      const unidPorVol = Math.max(1, parseInt(m.unidadesPorVolume, 10) || 1);
      m.unidadesPorVolume = unidPorVol;
      const qtdVol = Math.max(0, Math.ceil(parseFloat(m.qtd) || 0));

      if (!Array.isArray(m.volumes)) {
        m.volumes = Array.from({ length: qtdVol }, () => unidPorVol);
      } else {
        // Remove fardos/caixas que já zeraram (0 unidades)
        m.volumes = m.volumes.map((u) => Number(parseFloat(u) || 0)).filter((u) => u > 0);
      }

      m.qtd = m.volumes.length;
      m.totalUnidades = m.volumes.reduce((acc, u) => acc + u, 0);
      return m;
    },

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
      if (document.getElementById("mat-unid-por-volume")) {
        document.getElementById("mat-unid-por-volume").value = "1";
      }
      Categorias.renderPillsESelects();

      if (id) {
        const m = state.materiais.find((x) => x.id === id);
        if (!m) return;
        Estoque.sincronizarVolumes(m);
        document.getElementById("mat-id").value = m.id;
        document.getElementById("mat-codigo").value = m.codigo || "";
        document.getElementById("mat-nome").value = m.nome;
        document.getElementById("mat-categoria").value = m.categoria;
        document.getElementById("mat-qtd").value = m.qtd;
        document.getElementById("mat-unidade").value = m.unidade;
        if (document.getElementById("mat-unid-por-volume")) {
          document.getElementById("mat-unid-por-volume").value = m.unidadesPorVolume || 1;
        }
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
      const itemDuplicado = Estoque.verificarCodigoDuplicado();
      if (itemDuplicado) {
        return Utils.toast(`Não permitido: O Nº de item informado já pertence a "${itemDuplicado.nome}"!`, "error");
      }

      const id = document.getElementById("mat-id").value;
      const qtdVolumes = Math.max(0, Math.floor(parseFloat(document.getElementById("mat-qtd").value) || 0));
      const unidPorVolume = Math.max(1, parseInt(document.getElementById("mat-unid-por-volume")?.value, 10) || 1);

      let volumesArray = [];
      if (id) {
        const antigo = state.materiais.find((x) => x.id === id);
        if (antigo && Array.isArray(antigo.volumes)) {
          volumesArray = [...antigo.volumes];
        }
      }
      // Ajusta a lista individual de fardos/caixas para refletir a quantidade cadastrada
      while (volumesArray.length < qtdVolumes) {
        volumesArray.push(unidPorVolume);
      }
      if (volumesArray.length > qtdVolumes) {
        volumesArray = volumesArray.slice(0, qtdVolumes);
      }

      const obj = {
        id: id || "MAT_" + Date.now(),
        codigo: document.getElementById("mat-codigo").value.trim(),
        nome: document.getElementById("mat-nome").value.trim(),
        categoria: document.getElementById("mat-categoria").value,
        qtd: volumesArray.length,
        unidade: document.getElementById("mat-unidade").value,
        unidadesPorVolume: unidPorVolume,
        volumes: volumesArray,
        totalUnidades: volumesArray.reduce((a, b) => a + b, 0),
        minimo: parseFloat(document.getElementById("mat-minimo").value) || 0,
        local: document.getElementById("mat-local").value.trim(),
        deleted: false
      };

      DB.save("materiais", obj, () => {
        if (!id && qtdVolumes > 0) {
          const registoEntradaInicial = {
            id: "ENT_" + Date.now(),
            data: Utils.hojeISO(),
            tipo: "ENTRADA",
            setor: "Cadastro Inicial de Estoque",
            responsavel: "Almoxarifado",
            documento: "Estoque Inicial",
            itens: [{
              id: obj.id,
              codigo: obj.codigo,
              nome: obj.nome,
              categoria: obj.categoria,
              unidade: obj.unidadesPorVolume > 1 ? `${obj.unidade} (${obj.unidadesPorVolume} un./vol)` : obj.unidade,
              qtd: qtdVolumes,
              modoRetirada: "VOLUME_INTEIRO"
            }]
          };
          DB.save("historico", registoEntradaInicial, () => {
            Historico.render();
          });
        }
        document.getElementById("modalMaterial").classList.remove("active");
        Utils.toast(id ? "Material atualizado!" : "Material cadastrado com seus volumes individuais!");
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

    // NOVA FUNÇÃO: Abre a aba exclusiva ao dar 2 cliques no material mostrando cada Fardo/Caixa individualmente
    abrirInspecaoVolumes: (id) => {
      const m = state.materiais.find((x) => x.id === id);
      if (!m) return;
      Estoque.materialInspecionadoId = m.id;
      Estoque.sincronizarVolumes(m);

      document.getElementById("det-vol-codigo").textContent = `Nº ${m.codigo || "--"}`;
      document.getElementById("det-vol-categoria").textContent = m.categoria;
      document.getElementById("det-vol-titulo").textContent = m.nome;
      document.getElementById("det-vol-subtitulo").innerHTML = `
        Total na Prateleira: <strong style="color:var(--success)">${m.qtd} ${m.unidade}</strong> 
        (${m.unidadesPorVolume} unid. por ${m.unidade}) • 
        Saldo Total de Unidades Soltas: <strong style="color:var(--info)">${m.totalUnidades} Unid.</strong>
      `;

      document.getElementById("btn-det-repor").onclick = () => Estoque.abrirMovIndividual(m.id, "ENTRADA");
      document.getElementById("btn-det-baixa").onclick = () => Estoque.abrirMovIndividual(m.id, "SAIDA");

      const grid = document.getElementById("volumes-grid-container");
      grid.innerHTML = "";

      if (m.volumes.length === 0) {
        grid.innerHTML = `
          <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 45px;">
            <p class="text-muted">Este material está com estoque zerado (0 volumes disponíveis).</p>
          </div>
        `;
      } else {
        m.volumes.forEach((unidRestantes, index) => {
          const capMax = m.unidadesPorVolume || 1;
          const pct = Math.min(100, Math.round((unidRestantes / capMax) * 100));
          const isAberto = unidRestantes < capMax;
          const cor = isAberto ? "var(--warning)" : "var(--success)";

          const box = document.createElement("div");
          box.className = `volume-unit-card ${isAberto ? "volume-aberto" : ""}`;
          box.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span class="sku-badge">${m.unidade} #${String(index + 1).padStart(3, "0")}</span>
              <span style="font-size:11px; font-weight:800; color:${cor};">
                ${isAberto ? "🔓 ABERTO " : "📦 FECHADO 100%"}
              </span>
            </div>
            <div style="font-size:14px; font-weight:700; color:white; margin-bottom:6px;">
              ${m.nome}
            </div>
            <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted); margin-bottom:6px;">
              <span>Unidades neste volume:</span>
              <strong style="color:${cor}; font-size:14px;">${unidRestantes} / ${capMax} unid.</strong>
            </div>
            <div class="gauge-bar-bg" style="margin-bottom:12px;">
              <div class="gauge-bar-fill" style="width:${pct}%; background:${cor};"></div>
            </div>
            <div style="display:flex; gap:6px;">
              <button
                class="btn-step saida"
                style="flex:1; justify-content:center;"
                onclick="window.app.retirarUnidadesDeVolumeEspecifico('${m.id}', ${index})"
                title="Retirar unidades ou este volume inteiro"
              >
                <i data-lucide="minus-circle" style="width:13px;"></i> Retirar Deste
              </button>
            </div>
          `;
          grid.appendChild(box);
        });
      }

      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      document.getElementById("view-detalhe-volumes")?.classList.add("active");
      renderIcons();
    },

    // Permite clicar diretamente em um dos 100 fardos/caixas na aba de detalhes para tirar unidades dele
    retirarUnidadesDeVolumeEspecifico: (id, indiceVolume) => {
      Estoque.indiceVolumePreferencial = indiceVolume;
      Estoque.abrirMovIndividual(id, "SAIDA");
    },

    alternarModoRetiradaIndividual: () => {
      const id = document.getElementById("ind-mat-id").value;
      const m = state.materiais.find((x) => x.id === id);
      if (!m) return;
      const modo = document.getElementById("ind-modo-retirada")?.value || "VOLUME_INTEIRO";
      const labelQtd = document.getElementById("ind-label-qtd");
      const inpQtd = document.getElementById("ind-qtd");

      if (modo === "UNIDADES_SOLTAS") {
        labelQtd.textContent = `Qtd. de Unidades Soltas a Retirar (Disponível: ${m.totalUnidades} unid.)`;
        inpQtd.max = m.totalUnidades;
        inpQtd.step = "1";
      } else {
        labelQtd.textContent = `Qtd. de ${m.unidade} Inteiro(s) a Retirar (Disponível: ${m.qtd} ${m.unidade})`;
        inpQtd.max = m.qtd;
        inpQtd.step = "1";
      }
    },

    abrirMovIndividual: (id, tipo = "SAIDA") => {
      const m = state.materiais.find((x) => x.id === id);
      if (!m) return;
      Estoque.sincronizarVolumes(m);

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
      const wrapModoRetirada = document.getElementById("ind-wrap-modo-retirada");
      const btn = document.getElementById("ind-btn-submit");

      selUnidade.value = m.unidade;
      CustomSelect.init("ind-unidade");
      CustomSelect.init("ind-modo-unidade");
      boxConversao.style.display = "none";

      const temMultiplasUnidades = (m.unidadesPorVolume || 1) > 1 || ["Cx.", "Fardo", "Pct.", "Resma"].includes(m.unidade);

      document.getElementById("ind-resumo-box").innerHTML = `
        <span class="sku-badge">Nº ${m.codigo}</span> <strong style="color:white; font-size:15px; margin-left:6px;">${m.nome}</strong><br/>
        <span class="text-muted">Volumes na prateleira:</span> <strong style="color:var(--success)">${m.qtd} ${m.unidade}</strong>
        ${m.unidadesPorVolume > 1 ? ` • <span class="text-muted">Total em Unidades:</span> <strong style="color:var(--info)">${m.totalUnidades} Unid.</strong> (${m.unidadesPorVolume} Und Em cada - ${m.unidade})` : ""}
      `;

      if (tipo === "SAIDA") {
        document.getElementById("modal-mov-ind-titulo").innerHTML = `<i data-lucide="arrow-down-circle" style="color:var(--warning)"></i> Dar Baixa no Material`;
        blocoSaida.style.display = "block";
        inputSetor.setAttribute("required", "true");
        inputResp.setAttribute("required", "true");
        grupoUnidade.style.display = "none";

        if (wrapModoRetirada) {
          wrapModoRetirada.style.display = temMultiplasUnidades ? "block" : "none";
          document.getElementById("ind-modo-retirada").value = "VOLUME_INTEIRO";
          CustomSelect.init("ind-modo-retirada");
        }

        Estoque.alternarModoRetiradaIndividual();
        labelQtd.style.color = "var(--warning)";
        btn.style.background = "var(--warning)";
        btn.style.color = "#000";
        btn.textContent = "Confirmar Baixa no Estoque";
      } else {
        document.getElementById("modal-mov-ind-titulo").innerHTML = `<i data-lucide="plus-circle" style="color:var(--success)"></i> Repor Material no Estoque`;
        blocoSaida.style.display = "none";
        inputSetor.removeAttribute("required");
        inputResp.removeAttribute("required");
        if (wrapModoRetirada) wrapModoRetirada.style.display = "none";
        grupoUnidade.style.display = "block";
        labelQtd.textContent = `Quantidade de ${m.unidade} a Repor`;
        labelQtd.style.color = "var(--success)";
        btn.style.background = "var(--success)";
        btn.style.color = "#000";
        btn.textContent = "Confirmar Reposição de Estoque";
      }

      document.getElementById("modalMovIndividual").classList.add("active");
      renderIcons();
      setTimeout(() => document.getElementById("ind-qtd").focus(), 100);
    },

    confirmarMovIndividual: () => {
      const id = document.getElementById("ind-mat-id").value;
      const tipo = document.getElementById("ind-tipo").value;
      const qtdInformada = parseFloat(document.getElementById("ind-qtd").value) || 0;
      const unidEscolhida = document.getElementById("ind-unidade").value;

      const m = state.materiais.find((x) => x.id === id);
      if (!m || qtdInformada <= 0) return;
      Estoque.sincronizarVolumes(m);

      if (tipo === "SAIDA") {
        const setor = document.getElementById("ind-setor").value.trim();
        const resp = document.getElementById("ind-responsavel").value.trim();
        const modoRetirada = document.getElementById("ind-modo-retirada")?.value || "VOLUME_INTEIRO";

        let unidParaDescontar = 0;
        let descricaoUnidadeHistorico = m.unidade;

        if (modoRetirada === "UNIDADES_SOLTAS" && m.unidadesPorVolume > 1) {
          unidParaDescontar = Math.round(qtdInformada);
          if (unidParaDescontar > m.totalUnidades) {
            return Utils.toast(`Saldo insuficiente! Disponível: ${m.totalUnidades} unidades soltas.`, "error");
          }
          descricaoUnidadeHistorico = `Unid. (de ${m.unidade})`;

          // Desconta as unidades soltas começando pelo volume preferencial ou pelos fardos já abertos
          let restanteDescontar = unidParaDescontar;
          if (typeof Estoque.indiceVolumePreferencial === "number" && m.volumes[Estoque.indiceVolumePreferencial] !== undefined) {
            const disp = m.volumes[Estoque.indiceVolumePreferencial];
            const tirar = Math.min(disp, restanteDescontar);
            m.volumes[Estoque.indiceVolumePreferencial] -= tirar;
            restanteDescontar -= tirar;
          }
          Estoque.indiceVolumePreferencial = null;

          // Ordena para consumir primeiro os fardos que já estão abertos (parciais)
          m.volumes.sort((a, b) => a - b);
          for (let i = 0; i < m.volumes.length && restanteDescontar > 0; i++) {
            const tirar = Math.min(m.volumes[i], restanteDescontar);
            m.volumes[i] -= tirar;
            restanteDescontar -= tirar;
          }
        } else {
          // Retirada de Caixas / Fardos inteiros
          const volsInteiros = Math.round(qtdInformada);
          if (volsInteiros > m.qtd) {
            return Utils.toast(`Saldo insuficiente! Disponível: ${m.qtd} ${m.unidade}`, "error");
          }
          unidParaDescontar = volsInteiros * (m.unidadesPorVolume || 1);
          // Remove fardos fechados primeiro
          m.volumes.sort((a, b) => b - a);
          m.volumes.splice(0, volsInteiros);
        }

        Estoque.sincronizarVolumes(m);

        const registroSaida = {
          id: "LOTE_" + Date.now(),
          data: Utils.hojeISO(),
          tipo: "SAIDA",
          setor,
          responsavel: resp,
          documento: modoRetirada === "UNIDADES_SOLTAS" ? "Retirada de Unidades Avulsas" : "Baixa de Volume Completo",
          itens: [{
            id: m.id,
            codigo: m.codigo,
            nome: m.nome,
            categoria: m.categoria,
            unidade: descricaoUnidadeHistorico,
            qtd: qtdInformada,
            modoRetirada,
            unidadesEquivalentes: unidParaDescontar
          }]
        };

        DB.save("materiais", m, () => {
          DB.save("historico", registroSaida, () => {
            document.getElementById("modalMovIndividual").classList.remove("active");
            Utils.toast(`Saída de ${qtdInformada} ${descricaoUnidadeHistorico} registrada!`);
            Estoque.render();
            Historico.render();
            if (document.getElementById("view-detalhe-volumes")?.classList.contains("active")) {
              Estoque.abrirInspecaoVolumes(m.id);
            }
          });
        });
      } else {
        // REPOSIÇÃO DE ESTOQUE (Adiciona novos Fardos/Caixas cheios)
        const volsAdicionar = Math.max(1, Math.round(qtdInformada));
        for (let i = 0; i < volsAdicionar; i++) {
          m.volumes.push(m.unidadesPorVolume || 1);
        }
        Estoque.sincronizarVolumes(m);

        const registroEntrada = {
          id: "LOTE_" + Date.now(),
          data: Utils.hojeISO(),
          tipo: "ENTRADA",
          setor: "Reposição de Almoxarifado",
          responsavel: "--",
          documento: `Entrada em ${unidEscolhida}`,
          itens: [{
            id: m.id,
            codigo: m.codigo,
            nome: m.nome,
            categoria: m.categoria,
            unidade: m.unidade,
            qtd: volsAdicionar,
            modoRetirada: "VOLUME_INTEIRO"
          }]
        };

        DB.save("materiais", m, () => {
          DB.save("historico", registroEntrada, () => {
            document.getElementById("modalMovIndividual").classList.remove("active");
            Utils.toast(`Estoque abastecido: +${volsAdicionar} ${m.unidade}!`);
            Estoque.render();
            Historico.render();
            if (document.getElementById("view-detalhe-volumes")?.classList.contains("active")) {
              Estoque.abrirInspecaoVolumes(m.id);
            }
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
        Estoque.sincronizarVolumes(m);
        const isCrit = m.qtd <= m.minimo;
        const refMax = Math.max(m.qtd, m.minimo * 3, 1);
        const pct = Math.min(100, Math.round((m.qtd / refMax) * 100));
        const cor = isCrit ? "var(--danger)" : m.qtd <= m.minimo * 1.5 ? "var(--warning)" : "var(--success)";
        const abertos = m.volumes.filter((u) => u < (m.unidadesPorVolume || 1)).length;

        const card = document.createElement("div");
        card.className = `shelf-card ${isCrit ? "card-critico" : ""}`;
        card.style.cursor = "pointer";
        card.title = "💡 Dê 2 cliques neste material para abrir todos os Fardos/Caixas cadastrados!";
        card.ondblclick = () => window.app.abrirInspecaoVolumes(m.id);

        card.innerHTML = `
          <div>
            <div class="shelf-top">
              <span class="sku-badge">Nº ${m.codigo || "--"}</span>
              <span class="cat-tag">${m.categoria}</span>
            </div>
            <h3 class="shelf-title">${m.nome}</h3>
            <p class="text-muted" style="font-size: 11.5px; margin-top: 4px;">
              <i data-lucide="map-pin" style="width: 12px; vertical-align: middle;"></i> ${m.local || "Almoxarifado Geral"}
              <span style="float:right; color:var(--info); font-size:10.5px;">🖱️ 2 cliques p/ ver volumes</span>
            </p>

            <div class="shelf-gauge-box" style="margin-top: 12px;">
              <div class="gauge-numbers">
                <span class="text-muted" style="font-size: 11.5px;">Disponível:</span>
                <span class="gauge-Current" style="color: ${cor};">
                  ${m.qtd} <small style="font-size: 13px; color: var(--text-muted); font-weight: 600;">${m.unidade}</small>
                </span>
              </div>
              ${
                m.unidadesPorVolume > 1
                  ? `<div style="font-size: 11.5px; color: var(--info); margin-top: 3px; font-weight: 600;">
                       📦 ${m.unidadesPorVolume} Und Em cada - ${m.unidade} • Total: <strong>${m.totalUnidades} unid.</strong>
                       ${abertos > 0 ? `<span style="color:var(--warning);">(${abertos} aberto)</span>` : ""}
                     </div>`
                  : ""
              }
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-top: 4px;">
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
              <button class="btn-step saida" onclick="event.stopPropagation(); window.app.abrirMovIndividual('${m.id}', 'SAIDA')" title="Dar baixa neste material">
                <i data-lucide="arrow-down-right" style="width: 14px;"></i> Dar Baixa
              </button>
              <button class="btn-step entrada" onclick="event.stopPropagation(); window.app.abrirMovIndividual('${m.id}', 'ENTRADA')" title="Repor material">
                <i data-lucide="plus" style="width: 14px;"></i> Repor
              </button>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="btn-mini-icon" onclick="event.stopPropagation(); window.app.abrirInspecaoVolumes('${m.id}')" title="Ver todos os Fardos/Caixas individuais">
                <i data-lucide="boxes" style="width: 14px;"></i>
              </button>
              <button class="btn-mini-icon" onclick="event.stopPropagation(); window.app.abrirModalMaterial('${m.id}')" title="Editar Material">
                <i data-lucide="pencil" style="width: 14px;"></i>
              </button>
              <button class="btn-mini-icon del" onclick="event.stopPropagation(); window.app.enviarParaLixeira('${m.id}')" title="Enviar para Lixeira">
                <i data-lucide="trash-2" style="width: 14px;"></i>
              </button>
            </div>
          </div>
        `;
        container.appendChild(card);
      });

      renderIcons();
    },

    // Inicializa os selects de Ano e Mês do Gráfico sempre no Ano e Mês atuais (com opção "Todos")
    initFiltrosGrafico: () => {
      const hoje = new Date();
      const anoAtual = hoje.getFullYear().toString();
      const mesAtual = (hoje.getMonth() + 1).toString().padStart(2, "0");

      const selAno = document.getElementById("grafico-ano");
      const selMes = document.getElementById("grafico-mes");

      if (selAno) {
        selAno.innerHTML = '<option value="Todos">Todos os Anos</option>';
        for (let y = 2024; y <= 2030; y++) {
          selAno.innerHTML += `<option value="${y}">${y}</option>`;
        }
        selAno.value = anoAtual;
        CustomSelect.init("grafico-ano");
      }

      if (selMes) {
        selMes.innerHTML = '<option value="Todos">Todos os Meses</option>';
        [
          "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
          "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
        ].forEach((m, i) => {
          const numMes = (i + 1).toString().padStart(2, "0");
          selMes.innerHTML += `<option value="${numMes}">${m}</option>`;
        });
        selMes.value = mesAtual;
        CustomSelect.init("grafico-mes");
      }

      CustomSelect.init("grafico-tipo");
      Estoque.mudarFiltroGrafico();
    },

    // Atualiza as opções de Dia, Semana, Mês e Ano sempre filtrando a data atual por padrão
    mudarFiltroGrafico: () => {
      const elTipo = document.getElementById("grafico-tipo");
      if (!elTipo) return;

      const tipo = elTipo.value;
      const selectValor = document.getElementById("grafico-valor");
      const wrapMes = document.getElementById("wrap-grafico-mes");
      const wrapDetalhe = document.getElementById("wrap-grafico-detalhe");
      const labelDetalhe = document.getElementById("label-grafico-detalhe");

      const hoje = new Date();
      const diaHojeStr = hoje.getDate().toString().padStart(2, "0");
      const diaHojeNum = hoje.getDate();

      selectValor.innerHTML = "";

      if (tipo === "DIARIO") {
        // Mostra Ano + Mês + Dia (selecionado no Dia Atual)
        if (wrapMes) wrapMes.style.display = "block";
        if (wrapDetalhe) wrapDetalhe.style.display = "block";
        if (labelDetalhe) labelDetalhe.textContent = "Selecionar Dia do Mês";

        selectValor.innerHTML = '<option value="Todos">Todos os Dias</option>';
        for (let d = 1; d <= 31; d++) {
          const diaFormatado = d.toString().padStart(2, "0");
          selectValor.innerHTML += `<option value="${diaFormatado}">Dia ${diaFormatado}${diaFormatado === diaHojeStr ? " (Hoje)" : ""}</option>`;
        }
        selectValor.value = diaHojeStr;
      } else if (tipo === "SEMANAL") {
        // Mostra Ano + Mês + Semana do Mês (selecionada na Semana Atual)
        if (wrapMes) wrapMes.style.display = "block";
        if (wrapDetalhe) wrapDetalhe.style.display = "block";
        if (labelDetalhe) labelDetalhe.textContent = "Selecionar Semana do Mês";

        selectValor.innerHTML = `
          <option value="Todas">Todas as Semanas</option>
          <option value="1">Semana 1 (Dias 01 a 07)</option>
          <option value="2">Semana 2 (Dias 08 a 14)</option>
          <option value="3">Semana 3 (Dias 15 a 21)</option>
          <option value="4">Semana 4 (Dias 22 a 28)</option>
          <option value="5">Semana 5 (Dias 29 a 31)</option>
        `;
        const semanaAtual =
          diaHojeNum <= 7 ? "1" :
          diaHojeNum <= 14 ? "2" :
          diaHojeNum <= 21 ? "3" :
          diaHojeNum <= 28 ? "4" : "5";
        selectValor.value = semanaAtual;
      } else if (tipo === "MENSAL") {
        // Mostra Ano + Mês (com Mês Atual selecionado e opção Todos os Meses)
        if (wrapMes) wrapMes.style.display = "block";
        if (wrapDetalhe) wrapDetalhe.style.display = "none";
      } else if (tipo === "ANUAL") {
        // Mostra apenas o Ano (com Ano Atual selecionado e opção Todos os Anos)
        if (wrapMes) wrapMes.style.display = "none";
        if (wrapDetalhe) wrapDetalhe.style.display = "none";
      }

      CustomSelect.init("grafico-valor");
      Estoque.atualizarGraficos();
    },

    atualizarGraficos: () => {
      if (!window.Chart) return;
      Chart.defaults.color = "#94a3b8";
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#6366f1";

      const tipoFiltro = document.getElementById("grafico-tipo")?.value || "MENSAL";
      const anoFiltro = document.getElementById("grafico-ano")?.value || new Date().getFullYear().toString();
      const mesFiltro = document.getElementById("grafico-mes")?.value || (new Date().getMonth() + 1).toString().padStart(2, "0");
      const detalheFiltro = document.getElementById("grafico-valor")?.value || "Todos";

      const consumoUnidade = {};

      state.historico.filter((h) => h.tipo === "SAIDA").forEach((h) => {
        const [hAno, hMes, hDia] = (h.data || "").split("-");
        if (!hAno || !hMes || !hDia) return;

        const matchAno = anoFiltro === "Todos" || hAno === anoFiltro;
        const matchMes = mesFiltro === "Todos" || hMes === mesFiltro;
        let passaFiltro = false;

        if (tipoFiltro === "ANUAL") {
          passaFiltro = matchAno;
        } else if (tipoFiltro === "MENSAL") {
          passaFiltro = matchAno && matchMes;
        } else if (tipoFiltro === "SEMANAL") {
          const diaNum = parseInt(hDia, 10);
          const semanaItem =
            diaNum <= 7 ? "1" :
            diaNum <= 14 ? "2" :
            diaNum <= 21 ? "3" :
            diaNum <= 28 ? "4" : "5";
          const matchSemana = detalheFiltro === "Todas" || semanaItem === detalheFiltro;
          passaFiltro = matchAno && matchMes && matchSemana;
        } else if (tipoFiltro === "DIARIO") {
          const matchDia = detalheFiltro === "Todos" || hDia === detalheFiltro;
          passaFiltro = matchAno && matchMes && matchDia;
        }

        if (passaFiltro) {
          const u = h.setor || "Outros";
          const soma = (h.itens || []).reduce((acc, it) => acc + (parseFloat(it.qtd) || 0), 0);
          consumoUnidade[u] = (consumoUnidade[u] || 0) + soma;
        }
      });

      const porCat = {};
      state.materiais.filter((m) => !m.deleted).forEach((m) => {
        porCat[m.categoria] = (porCat[m.categoria] || 0) + (parseFloat(m.qtd) || 0);
      });

      if (state.charts.unidades) state.charts.unidades.destroy();
      const ctxU = document.getElementById("chart-unidades");
      if (ctxU) {
        state.charts.unidades = new Chart(ctxU, {
          type: "bar",
          data: {
            labels: Object.keys(consumoUnidade).length ? Object.keys(consumoUnidade) : ["Nenhuma saída no período"],
            datasets: [{
              data: Object.values(consumoUnidade).length ? Object.values(consumoUnidade) : [0],
              backgroundColor: accent,
              borderRadius: 8
            }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
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
          options: { responsive: true, maintainAspectRatio: false, cutout: "72%", plugins: { legend: { position: "right" } } }
        });
      }
    },
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
      document.getElementById("pedido-documento").value = "";
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
          Estoque.sincronizarVolumes(m);
          const temUnidadesInternas = (m.unidadesPorVolume || 1) > 1;
          const row = document.createElement("div");
          row.className = "pedido-item-row";
          row.dataset.busca = `${m.codigo} ${m.nome} ${m.categoria}`.toLowerCase();
          row.innerHTML = `
            <div class="font-mono" style="font-weight: 700; color: var(--accent);">Nº ${m.codigo || "-"}</div>
            <div style="font-weight: 600; color: white;">
              ${m.nome}
              ${temUnidadesInternas ? `<small style="display:block; color:var(--info); font-size:11px;">📦 ${m.unidadesPorVolume} un./${m.unidade} (Total: ${m.totalUnidades} un.)</small>` : ""}
            </div>
            <div><span class="cat-tag">${m.categoria}</span></div>
            <div style="text-align: center; color: ${m.qtd <= m.minimo ? "var(--danger)" : "var(--text-muted)"}; font-weight: 600;">
              ${m.qtd} ${m.unidade}
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <input
                type="number"
                step="1"
                min="0"
                class="input-modern qtd-saida-lote"
                style="padding: 6px 10px !important; text-align: center; border-color: var(--warning);"
                data-id="${m.id}"
                placeholder="0"
                oninput="window.app.calcularResumoModalSaida()"
              />
              ${
                temUnidadesInternas
                  ? `<select class="modo-saida-lote" data-id="${m.id}" style="background:#06080e; color:#a5f3fc; border:1px solid var(--border-glass); border-radius:6px; padding:3px 6px; font-size:11px;">
                       <option value="VOLUME_INTEIRO">Em ${m.unidade} (Inteiro)</option>
                       <option value="UNIDADES_SOLTAS">Em Unid. Soltas</option>
                     </select>`
                  : `<input type="hidden" class="modo-saida-lote" data-id="${m.id}" value="VOLUME_INTEIRO" />`
              }
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

    processarSaidaLote: () => {
      const setor = document.getElementById("pedido-setor").value.trim();
      const responsavel = document.getElementById("pedido-responsavel").value.trim() || "Servidor Designado";
      const documento = document.getElementById("pedido-documento").value.trim() || "Requisição Interna";

      if (!setor) {
        return Utils.toast("Selecione ou digite a Unidade Destino!", "error");
      }

      const itensEscolhidos = [];
      let erroSaldo = null;

      document.querySelectorAll(".qtd-saida-lote").forEach((inp) => {
        const qtd = Math.round(parseFloat(inp.value) || 0);
        if (qtd > 0) {
          const mat = state.materiais.find((m) => m.id === inp.dataset.id);
          const selModo = document.querySelector(`.modo-saida-lote[data-id="${inp.dataset.id}"]`);
          const modoRetirada = selModo ? selModo.value : "VOLUME_INTEIRO";

          if (mat) {
            Estoque.sincronizarVolumes(mat);
            if (modoRetirada === "UNIDADES_SOLTAS" && mat.unidadesPorVolume > 1) {
              if (qtd > mat.totalUnidades) {
                erroSaldo = `O item "${mat.nome}" possui apenas ${mat.totalUnidades} unidades soltas disponíveis!`;
              }
              itensEscolhidos.push({
                id: mat.id,
                codigo: mat.codigo,
                nome: mat.nome,
                categoria: mat.categoria,
                unidade: `Unid. (de ${mat.unidade})`,
                qtd,
                modoRetirada,
                unidadesEquivalentes: qtd
              });
            } else {
              if (qtd > mat.qtd) {
                erroSaldo = `O item "${mat.nome}" possui apenas ${mat.qtd} ${mat.unidade} disponível!`;
              }
              itensEscolhidos.push({
                id: mat.id,
                codigo: mat.codigo,
                nome: mat.nome,
                categoria: mat.categoria,
                unidade: mat.unidade,
                qtd,
                modoRetirada: "VOLUME_INTEIRO",
                unidadesEquivalentes: qtd * (mat.unidadesPorVolume || 1)
              });
            }
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

      // Desconta de cada fardo/caixa na lista volumes
      itensEscolhidos.forEach((item) => {
        const mat = state.materiais.find((m) => m.id === item.id);
        if (mat) {
          Estoque.sincronizarVolumes(mat);
          if (item.modoRetirada === "UNIDADES_SOLTAS" && mat.unidadesPorVolume > 1) {
            let restante = item.qtd;
            mat.volumes.sort((a, b) => a - b); // Consome primeiro os fardos abertos
            for (let i = 0; i < mat.volumes.length && restante > 0; i++) {
              const tirar = Math.min(mat.volumes[i], restante);
              mat.volumes[i] -= tirar;
              restante -= tirar;
            }
          } else {
            mat.volumes.sort((a, b) => b - a); // Retira fardos fechados
            mat.volumes.splice(0, item.qtd);
          }
          Estoque.sincronizarVolumes(mat);
          DB.save("materiais", mat);
        }
      });

      DB.save("historico", registroLote, () => {
        document.getElementById("modalGerarSaida").classList.remove("active");
        Utils.toast(`Baixa registrada para ${setor}!`);
        Estoque.render();
        Historico.render();
      });
    },

    exportarDocumentoWord: (lote) => {
      const isEntrada = lote.tipo === "ENTRADA";
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

      const tituloDoc = isEntrada ? "ENTRADA E REPOSIÇÃO DE MATERIAIS" : "SAÍDA DE MATERIAIS";
      const labelSetor = isEntrada ? "FORNECEDOR:" : "SETOR DESTINO:";
      const labelData = isEntrada ? "DATA DA ENTRADA:" : "DATA DA ENTREGA:";
      const labelResp = isEntrada ? "REGISTADO POR:" : "RECEBIDO POR:";
      const labelQtd = isEntrada ? "Qtd. Entrada" : "Qtd. Entregue";
      const labelTotal = isEntrada ? "TOTAL DE VOLUMES RECEBIDOS:" : "TOTAL DE VOLUMES ENTREGUES:";

      const htmlWord = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>${tituloDoc}</title>
          <style>
            body { font-family: 'Calibri', 'Arial', sans-serif; color: #000; }
            .header-box { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 18px; }
            h1 { font-size: 15pt; margin: 0; text-transform: uppercase; }
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
            <h3>${tituloDoc}</h3>
          </div>

          <table class="meta-table">
            <tr>
              <td style="width: 55%;"><strong>${labelSetor}</strong> ${lote.setor}</td>
              <td style="width: 45%;"><strong>${labelData}</strong> ${Utils.formatDate(lote.data)}</td>
            </tr>
            <tr>
              <td><strong>${labelResp}</strong> ${lote.responsavel && lote.responsavel !== "--" ? lote.responsavel : "Almoxarifado Central"}</td>
              <td><strong>DOCUMENTO REFERÊNCIA:</strong> ${lote.documento || lote.id}</td>
            </tr>
          </table>

          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 12%;">Nº Item</th>
                <th style="width: 46%;">Especificação do Material</th>
                <th style="width: 18%;">Categoria</th>
                <th style="width: 12%;">Unid.</th>
                <th style="width: 12%;">${labelQtd}</th>
              </tr>
            </thead>
            <tbody>
              ${linhasHtml}
              <tr class="total-row">
                <td colspan="4" style="text-align: right;">${labelTotal}</td>
                <td style="text-align: center;">${totalVolumes}</td>
              </tr>
            </tbody>
          </table>

          <br/><br/>
          <table style="width: 100%; border: none; margin-top: 35px; text-align: center;">
            <tr>
              <td style="width: 48%; border: none;">
                ___________________________________________________<br/>
                <strong>MAIARA CRISTINA LÓPES</strong><br/>
                <span style="font-size: 9.5pt; color: #444;">Coordenadora do Centro de Qualificação</span>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      const prefixo = isEntrada ? "Guia_Entrada" : "Guia_Saida";
      const nomeLimpo = (lote.setor || "Almoxarifado").replace(/[^a-zA-Z0-9]/g, "_").substring(0, 18);
      Utils.solicitarSalvamentoWord(`${prefixo}_${nomeLimpo}_${lote.data}`, htmlWord);
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
  }
  
  /* =========================================================
     10. HISTÓRICO DE ENTRADA E SAÍDA + GERADOR WORD E ESTORNO
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
        fA.innerHTML += `<option value="${y}">${y}</option>`;
      }

      const dataHoje = new Date();
      fM.value = (dataHoje.getMonth() + 1).toString().padStart(2, "0");
      fA.value = dataHoje.getFullYear().toString();

      CustomSelect.init("hist-tipo");
      CustomSelect.init("hist-mes");
      CustomSelect.init("hist-ano");
    },

    obterListaFiltrada: (tipoForcado = null) => {
      const tipoSel = tipoForcado || document.getElementById("hist-tipo")?.value || "Todos";
      const mes = document.getElementById("hist-mes").value;
      const ano = document.getElementById("hist-ano").value;
      const busca = (document.getElementById("hist-busca").value || "").toLowerCase();

      return state.historico
        .filter((h) => {
          if (tipoSel !== "Todos" && h.tipo !== tipoSel) return false;
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

      const lista = Historico.obterListaFiltrada(null);
      container.innerHTML = "";

      if (lista.length === 0) {
        container.innerHTML = `
          <div class="card" style="text-align: center; padding: 45px;">
            <p class="text-muted">Nenhuma movimentação de entrada ou saída encontrada para o filtro selecionado.</p>
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
                ${isSaida ? "SAÍDA" : "ENTRADA / REPOSIÇÃO"}
              </span>
              <strong style="font-size: 16px; color: white;">${h.setor}</strong>
              ${isSaida ? `<span style="font-size: 11px; color: var(--info);">Recebido por: ${h.responsavel}</span>` : `<span style="font-size: 11px; color: var(--success);">Ref: ${h.documento || "Entrada"}</span>`}
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
              ${resumoItens}
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button
              class="btn btn-outline btn-sm"
              style="border-color: ${isSaida ? "var(--warning)" : "var(--success)"}; color: ${isSaida ? "#fde047" : "#6ee7b7"};"
              onclick="window.app.reemitirWord('${h.id}')"
              title="Gerar documento Word individual desta ${isSaida ? "Saída" : "Entrada"}"
            >
              <i data-lucide="file-text"></i> Word ${isSaida ? "Saída" : "Entrada"} (.doc)
            </button>
            <button class="btn-mini-icon del" onclick="window.app.excluirHistorico('${h.id}')" title="Apagar e Devolver ao Estoque">
              <i data-lucide="trash-2" style="width: 14px;"></i>
            </button>
          </div>
        `;
        container.appendChild(div);
      });
      renderIcons();
    },

    // Gera Word consolidado (Total do Período) tanto para SAIDA quanto para ENTRADA
    gerarWordConsolidadoPorTipo: (tipoMov) => {
      const isEntrada = tipoMov === "ENTRADA";
      const registos = Historico.obterListaFiltrada(tipoMov);

      if (registos.length === 0) {
        return Utils.toast(
          `Não há ${isEntrada ? "entradas" : "saídas"} registadas para o período filtrado!`,
          "error"
        );
      }

      const mes = document.getElementById("hist-mes").value;
      const ano = document.getElementById("hist-ano").value;
      const nomeMes = mes === "Todos" ? "TODOS OS MESES" : Utils.getMonthName(mes).toUpperCase();
      const nomeAno = ano === "Todos" ? "TODOS OS ANOS" : ano;

      let linhas = "";
      let totalVolumes = 0;

      registos.forEach((h) => {
        (h.itens || []).forEach((it) => {
          totalVolumes += parseFloat(it.qtd) || 0;
          linhas += `
            <tr>
              <td style="text-align: center;">${Utils.formatDate(h.data)}</td>
              <td><strong>${h.setor}</strong></td>
              <td>${isEntrada ? (h.documento || "Reposição") : (h.responsavel || "-")}</td>
              <td style="text-align: center;">${it.codigo || "-"}</td>
              <td>${it.nome}</td>
              <td style="text-align: center; font-weight: bold;">${it.qtd} ${it.unidade}</td>
            </tr>
          `;
        });
      });

      const tituloRel = isEntrada
        ? "RELATÓRIO GERAL DE ENTRADAS E REPOSIÇÕES DE MATERIAIS"
        : "RELATÓRIO GERAL DE SAÍDAS DE MATERIAIS";

      const htmlWord = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>${tituloRel}</title>
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
          <h3>${tituloRel}</h3>
          <h4>PERÍODO: ${nomeMes} - ${nomeAno}</h4>

          <table>
            <thead>
              <tr>
                <th style="width: 12%;">Data</th>
                <th style="width: 22%;">${isEntrada ? "Origem" : "Setor Destino"}</th>
                <th style="width: 18%;">${isEntrada ? "Referência" : "Solicitante"}</th>
                <th style="width: 8%;">Nº Item</th>
                <th style="width: 28%;">${isEntrada ? "Material Recebido" : "Material Entregue"}</th>
                <th style="width: 12%;">Quantidade</th>
              </tr>
            </thead>
            <tbody>
              ${linhas}
              <tr style="background-color: #f1f5f9; font-weight: bold;">
                <td colspan="5" style="text-align: right;">TOTAL GERAL DE VOLUMES ${isEntrada ? "RECEBIDOS" : "ENTREGUES"} NO PERÍODO:</td>
                <td style="text-align: center;">${totalVolumes}</td>
              </tr>
            </tbody>
          </table>
        </body>
        </html>
      `;

      const prefixo = isEntrada ? "Entradas_Totais" : "Saidas_Totais";
      Utils.solicitarSalvamentoWord(`${prefixo}_${nomeMes.replace(/\s+/g, "_")}_${nomeAno}`, htmlWord);
    },

    gerarWordFiltrado: () => Historico.gerarWordConsolidadoPorTipo("SAIDA"),
    gerarWordEntradasFiltradas: () => Historico.gerarWordConsolidadoPorTipo("ENTRADA"),

    reemitirWord: (id) => {
      const h = state.historico.find((x) => x.id === id);
      if (h) ListaSaidaWord.exportarDocumentoWord(h);
    },

    // Apaga o registo do histórico e devolve (ou desconta) as quantidades no estoque do Firebase
    // Apaga o registo do histórico e devolve (ou desconta) os fardos/unidades na lista volumes do Firebase
    excluirHistorico: async (id) => {
      const h = state.historico.find((x) => x.id === id);
      if (!h) return;

      const isSaida = h.tipo === "SAIDA";
      const textoConfirm = isSaida
        ? "Deseja apagar esta SAÍDA do histórico? Os materiais/unidades voltarão automaticamente para o estoque!"
        : "Deseja apagar esta ENTRADA do histórico? A quantidade será descontada do saldo em estoque.";

      if (confirm(textoConfirm)) {
        for (const it of (h.itens || [])) {
          const qtdMov = Math.round(parseFloat(it.qtd) || 0);
          let mat = state.materiais.find(
            (m) => m.id === it.id || (m.nome || "").toLowerCase() === (it.nome || "").toLowerCase()
          );

          if (mat) {
            Estoque.sincronizarVolumes(mat);
            const capMax = mat.unidadesPorVolume || 1;
            const foiUnidadesSoltas = it.modoRetirada === "UNIDADES_SOLTAS" && capMax > 1;

            if (isSaida) {
              // DEVOLVER SAÍDA PARA O ESTOQUE
              if (foiUnidadesSoltas) {
                let devolver = qtdMov;
                // Preenche primeiro algum fardo que esteja aberto/parcial
                for (let i = 0; i < mat.volumes.length && devolver > 0; i++) {
                  if (mat.volumes[i] < capMax) {
                    const cabe = capMax - mat.volumes[i];
                    const somar = Math.min(cabe, devolver);
                    mat.volumes[i] += somar;
                    devolver -= somar;
                  }
                }
                // Se ainda sobrarem unidades devolvidas, recria novos fardos/caixas
                while (devolver > 0) {
                  const novoVol = Math.min(capMax, devolver);
                  mat.volumes.push(novoVol);
                  devolver -= novoVol;
                }
              } else {
                // Devolve volumes (fardos/caixas) inteiros fechados
                for (let i = 0; i < qtdMov; i++) {
                  mat.volumes.push(capMax);
                }
              }
              if (mat.deleted) mat.deleted = false;
            } else {
              // ESTORNAR ENTRADA (RETIRAR DO ESTOQUE)
              mat.volumes.splice(0, Math.min(mat.volumes.length, qtdMov));
            }

            Estoque.sincronizarVolumes(mat);
            await new Promise((res) => DB.save("materiais", mat, res));
          } else if (isSaida) {
            // Caso o material tivesse sido apagado, recria-o na prateleira
            const matRecriado = {
              id: it.id || "MAT_" + Date.now(),
              codigo: it.codigo || Estoque.gerarProximoCodigoLivre(),
              nome: it.nome,
              categoria: it.categoria || state.categorias[0] || "Escritório",
              qtd: qtdMov,
              unidade: it.unidade || "Unid.",
              unidadesPorVolume: 1,
              volumes: Array.from({ length: qtdMov }, () => 1),
              totalUnidades: qtdMov,
              minimo: 5,
              local: "Almoxarifado Geral",
              deleted: false
            };
            await new Promise((res) => DB.save("materiais", matRecriado, res));
          }
        }

        await new Promise((res) => DB.delete("historico", id, res));
        Utils.toast(
          isSaida
            ? "Saída apagada! Os volumes/unidades voltaram para o estoque."
            : "Entrada apagada e saldo atualizado no estoque!"
        );
        Estoque.render();
        Historico.render();
        RelatoriosA4.render();
        Estoque.atualizarGraficos();
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

      if (btnWord) {
        if (tipo === "HISTORICO_SAIDAS") {
          btnWord.innerHTML = `<i data-lucide="file-text"></i> Gerar Word: Relatório de Saídas (.doc)`;
        } else if (tipo === "HISTORICO_ENTRADAS") {
          btnWord.innerHTML = `<i data-lucide="file-text"></i> Gerar Word: Relatório de Entradas (.doc)`;
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
      } else if (tipo === "HISTORICO_ENTRADAS") {
        document.getElementById("print-titulo").textContent = "RELATÓRIO GERAL DE ENTRADAS E REPOSIÇÕES";
        let rows = "";
        state.historico.filter((h) => h.tipo === "ENTRADA").forEach((h) => {
          const desc = (h.itens || []).map((i) => `${i.qtd} ${i.unidade} ${i.nome}`).join(", ");
          rows += `
            <tr>
              <td style="text-align:center;">${Utils.formatDate(h.data)}</td>
              <td><strong>${h.setor}</strong></td>
              <td>${h.documento || "Entrada"}</td>
              <td>${desc}</td>
            </tr>
          `;
        });
        wrap.innerHTML = `
          <table class="print-table">
            <thead>
              <tr><th>Data</th><th>Origem / Operação</th><th>Referência</th><th>Materiais Recebidos</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="4" style="text-align:center;">Nenhuma entrada registrada.</td></tr>'}</tbody>
          </table>
        `;
      } else {
        document.getElementById("print-titulo").textContent = "RELATÓRIO GERAL DE SAÍDAS";
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
              <tr><th>Data</th><th>Setor Destino</th><th>Recebedor</th><th>Materiais Entregues</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="4" style="text-align:center;">Nenhuma saída registrada.</td></tr>'}</tbody>
          </table>
        `;
      }
    },

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
        HISTORICO_ENTRADAS: `Relatorio_Entradas_${Utils.hojeISO()}`,
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
        for (const m of (obj.materiais || [])) {
          await new Promise((r) => DB.save("materiais", m, r));
        }
        for (const h of (obj.historico || [])) {
          await new Promise((r) => DB.save("historico", h, r));
        }
        Categorias.renderPillsESelects();
        Estoque.render();
        Historico.render();
        RelatoriosA4.render();
        Estoque.atualizarGraficos();
        Utils.toast("Backup restaurado e sincronizado na nuvem com sucesso!");
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
     // Função Global para Mostrar/Ocultar Senha
  window.mostrarSenha = () => {
    const inp = document.getElementById("login-senha");
    const icone = document.getElementById("eye-icon");
    if (inp) {
      if (inp.type === "password") {
        inp.type = "text";
        if(icone) icone.setAttribute("data-lucide", "eye-off");
      } else {
        inp.type = "password";
        if(icone) icone.setAttribute("data-lucide", "eye");
      }
      if (window.lucide) window.lucide.createIcons();
    }
  }
  
  return {
    init: () => {
      aplicarZoom(0);
      Security.init();
      Personalizacao.init();
      Categorias.renderPillsESelects();
      Historico.initFilters();

      CustomSelect.init("filtro-nivel-estoque");
      CustomSelect.init("filtro-ordenacao");
      CustomSelect.init("rel-tipo");

      DB.init(() => {
        Estoque.render();
        Historico.render();
        RelatoriosA4.render();
        Estoque.initFiltrosGrafico(); // Inicializa Diário, Semanal, Mensal e Anual na data atual
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
    mostrarSenha: () => {
      const inp = document.getElementById("login-senha");
      const icone = document.getElementById("eye-icon");
      if (inp.type === "password") {
        inp.type = "text";
        icone.setAttribute("data-lucide", "eye-off");
      } else {
        inp.type = "password";
        icone.setAttribute("data-lucide", "eye");
      }
      if (window.lucide) window.lucide.createIcons();
    },
    abrirModalCadastro: Estoque.abrirModalCadastro,
    fecharModalCadastro: Estoque.fecharModalCadastro,           
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
    gerarWordEntradasFiltradas: Historico.gerarWordEntradasFiltradas,
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
    mudarFiltroGrafico: Estoque.mudarFiltroGrafico, // Ou Estoque.mudarFiltroGrafico dependendo de onde colocou
    atualizarGraficos: Estoque.atualizarGraficos,
    abrirInspecaoVolumes: Estoque.abrirInspecaoVolumes,
    retirarUnidadesDeVolumeEspecifico: Estoque.retirarUnidadesDeVolumeEspecifico,
    alternarModoRetiradaIndividual: Estoque.alternarModoRetiradaIndividual,
  };
})();

window.app = App;
document.addEventListener("DOMContentLoaded", App.init);
