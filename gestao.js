import {
  auth,
  onAuthStateChanged,
  signOut
} from './firebase.js';

// IMPORTAÇÃO DO FIREBASE
import { ref, push, set, onValue, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

document.addEventListener('DOMContentLoaded', () => {

    // MONITOR DE LOGIN (Tudo roda aqui dentro para termos acesso ao 'user' logado)
    onAuthStateChanged(auth, (user) => {

        if (!user) {
            window.location.href = "login.html";
            return; // Para a execução se não estiver logado
        }

        // CAPTURA DOS ELEMENTOS DA TELA
        const formGestao = document.getElementById('form-gestao');
        const tabelaCorpo = document.getElementById('tabela-corpo');
        const indexEdicao = document.getElementById('index-edicao');
        const btnSalvar = document.getElementById('btn-salvar');
        const btnImprimir = document.getElementById('btn-imprimir');

        const filtroMes = document.getElementById('filtro-mes');
        const filtroAno = document.getElementById('filtro-ano');
        const filtroConta = document.getElementById('filtro-conta');
        const txtCompetenciaAtual = document.getElementById('txt-competencia-atual');

        const qtdRegistros = document.getElementById('qtd-registros');
        const valorAcumulado = document.getElementById('valor-acumulado');

        // BOTÃO SAIR (Criado dinamicamente no cabeçalho)
        const header = document.querySelector('header');
        // Evita duplicar o botão caso o onAuthStateChanged rode mais de uma vez
        if (!document.getElementById('btn-sair-dinamico')) {
            const btnSair = document.createElement('button');
            btnSair.id = 'btn-sair-dinamico';
            btnSair.innerText = "Sair";
            btnSair.style.background = "#ef4444";
            btnSair.style.color = "white";
            btnSair.style.border = "none";
            btnSair.style.padding = "10px 15px";
            btnSair.style.borderRadius = "8px";
            btnSair.style.cursor = "pointer";
            btnSair.style.marginLeft = "10px";
            btnSair.style.fontWeight = "bold";
            header.appendChild(btnSair);

            btnSair.addEventListener('click', async () => {
                await signOut(auth);
                window.location.href = "login.html";
            });
        }

        // BANCO DE DADOS ISOLADO POR USUÁRIO (usuarios/ID_DO_USUARIO/sistemaGestao)
        let bancoDados = [];
        const caminhoBanco = `usuarios/${user.uid}/sistemaGestao`;

        onValue(ref(window.db, caminhoBanco), (snapshot) => {
            const dados = snapshot.val();
            if (dados) {
                bancoDados = Object.keys(dados).map(id => {
                    return { ...dados[id], firebaseId: id };
                });
            } else {
                bancoDados = [];
            }
            filtrarEAtualizarInterface();
        });

        // CONFIGURAÇÃO DA DATA ATUAL NOS FILTROS
        const hoje = new Date();
        filtroMes.value = String(hoje.getMonth() + 1).padStart(2, '0');
        filtroAno.value = String(hoje.getFullYear());

        // FUNÇÃO DE ATUALIZAR A TABELA
        function filtrarEAtualizarInterface() {
            tabelaCorpo.innerHTML = '';
            let somatorioValores = 0;
            let contagemItens = 0;

            const mesSelecionado = filtroMes.value;
            const anoSelecionado = filtroAno.value;
            const contaSelecionada = filtroConta.value;

            txtCompetenciaAtual.textContent =
            `${contaSelecionada} — Competência: ${filtroMes.options[filtroMes.selectedIndex].text}/${anoSelecionado}`;

            bancoDados.forEach((item, index) => {
                // Proteção contra dados antigos sem data
                if (!item.data) return;

                const [anoItem, mesItem] = item.data.split('-');

                if (
                    item.conta === contaSelecionada &&
                    mesItem === mesSelecionado &&
                    anoItem === anoSelecionado
                ) {
                    contagemItens++;
                    somatorioValores += parseFloat(item.valor);

                    const dataBR = item.data.split('-').reverse().join('/');
                    const valorBR = parseFloat(item.valor).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                    });

                    let botaoPdfHtml = `<span class="btn-sem-pdf">Sem PDF</span>`;
                    if (item.arquivos && item.arquivos.length>0) {
                        botaoPdfHtml = item.arquivos.map(arquivo =>`
                          <a href="${arquivo.arquivo}" 
                           target="_blank" 
                           class="btn-pdf">
                           
                           ${arquivos.nome} 
                          </a>
                       `).join(");
                    }

                    const linha = document.createElement('tr');
                    linha.innerHTML = `
                        <td><strong>${item.empenho}</strong></td>
                        <td>${item.notaFiscal}</td>
                        <td>${item.fornecedor}</td>
                        <td>${valorBR}</td>
                        <td>${dataBR}</td>
                        <td>
                          <span style="
                            padding: 5px 10px;
                            border-radius: 6px;
                            font-weight: bold;
                            color: white;
                            background: ${item.status === 'Pago' ? '#22c55e' : '#ef4444'};
                          ">
                            ${item.status || 'Pendente'}
                          </span>
                        </td>
                        <td>${botaoPdfHtml}</td>
                        <td>
                            <button class="btn-editar" data-index="${index}">Editar</button>
                            <button class="btn-excluir" data-index="${index}">Apagar</button>
                        </td>
                    `;
                    tabelaCorpo.appendChild(linha);
                }
            });

            qtdRegistros.textContent = contagemItens;
            valorAcumulado.textContent = somatorioValores.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            });
        }

        // EVENTOS DOS FILTROS
        filtroMes.addEventListener('change', filtrarEAtualizarInterface);
        filtroAno.addEventListener('change', filtrarEAtualizarInterface);
        filtroConta.addEventListener('change', filtrarEAtualizarInterface);

        btnImprimir.addEventListener('click', () => {
            window.print();
        });

        // FORMULÁRIO - SALVAR OU ATUALIZAR DADOS
        formGestao.addEventListener('submit', function(event) {
            event.preventDefault();

            const empenhoVal = document.getElementById('empenho').value;
            const nfVal = document.getElementById('notaFiscal').value;
            const fornecedorVal = document.getElementById('fornecedor').value;
            const valorVal = document.getElementById('valor').value;
            const dataVal = document.getElementById('data').value;
            const statusVal = document.getElementById('status').value;
            const arquivoPdfInput = document.getElementById('arquivoPdf');
            const idEdicao = indexEdicao.value;

            const [anoInput, mesInput] = dataVal.split('-');

            function salvarDados(pdfBase64 = null) {
                const novoRegistro = {
                    conta: filtroConta.value,
                    empenho: empenhoVal,
                    notaFiscal: nfVal,
                    fornecedor: fornecedorVal,
                    valor: valorVal,
                    data: dataVal,
                    status: statusVal,
                    arquivos: pdfBase64 || (idEdicao !== "" ? bancoDados[idEdicao].pdfData : null)
                };

                // CADASTRO NOVO
                if (idEdicao === "") {
                    const novaRef = push(ref(window.db, caminhoBanco));
                    set(novaRef, novoRegistro);

                    filtroMes.value = mesInput;
                    filtroAno.value = anoInput;
                } 
                // ATUALIZAR EXISTENTE
                else {
                    const idDoFirebase = bancoDados[idEdicao].firebaseId;
                    delete novoRegistro.firebaseId; 
                    set(ref(window.db, `${caminhoBanco}/${idDoFirebase}`), novoRegistro);

                    indexEdicao.value = "";
                    btnSalvar.textContent = "Cadastrar";
                    btnSalvar.style.background = "#22c55e";
                }

                formGestao.reset();
            }

            if (arquivoPdfInput.files.length > 0) {
                const arquivos = arquivoPdfInput.files;
                const listaArquivos = []
                let arquivosLidos = 0;
                for(let i = 0; i < arquivos.lenght;i++){
                  const arquivoAtual = arquivos[i];
                  const leitor = new FileReader();
                  leitor.onload = function(e) {
                    listaArquivos.push({
                      nome: arquivoAtual.name,
                      arquivo:e.target.result
                    });
                    arquivoLidos++;
                    if(arquivosLidos === arquivos.length){
                       salvarDados(listaArquivos);
                };
                leitor.readAsDataURL(arquivoAtual);
               }
            } else {
                salvarDados();
            }
        });

        // EVENTOS DE CLIQUE NA TABELA (EDITAR E APAGAR)
        tabelaCorpo.addEventListener('click', function(event) {
            const index = event.target.getAttribute('data-index');
            if (!index) return;

            // EDITAR
            if (event.target.classList.contains('btn-editar')) {
                const item = bancoDados[index];

                document.getElementById('empenho').value = item.empenho;
                document.getElementById('notaFiscal').value = item.notaFiscal;
                document.getElementById('fornecedor').value = item.fornecedor;
                document.getElementById('valor').value = item.valor;
                document.getElementById('data').value = item.data;
                indexEdicao.value = index;

                btnSalvar.textContent = "Atualizar Registro";
                btnSalvar.style.background = "#3b82f6";
                document.getElementById('empenho').focus();
            }

            // APAGAR
            if (event.target.classList.contains('btn-excluir')) {
                if (confirm('Deseja mesmo remover este lançamento?')) {
                    const idDoFirebase = bancoDados[index].firebaseId;
                    remove(ref(window.db, `${caminhoBanco}/${idDoFirebase}`));

                    formGestao.reset();
                    indexEdicao.value = "";
                    btnSalvar.textContent = "Cadastrar";
                    btnSalvar.style.background = "#22c55e";
                }
            }
        });

        // Executa a primeira listagem
        filtrarEAtualizarInterface();

    });
});
