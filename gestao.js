import {
  auth,
  onAuthStateChanged,
  signOut
} from './firebase.js';

// IMPORTAÇÃO DO FIREBASE ADICIONADA AQUI
import { ref, push, set, onValue, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// VERIFICA LOGIN
onAuthStateChanged(auth, (user) => {

    if(!user){

        window.location.href =
        "login.html";

    }

});

document.addEventListener('DOMContentLoaded', () => {

    // BOTÃO SAIR
    const btnSair =
    document.createElement('button');

    btnSair.innerText = "Sair";

    btnSair.style.background = "#ef4444";

    btnSair.style.color = "white";

    btnSair.style.border = "none";

    btnSair.style.padding = "10px 15px";

    btnSair.style.borderRadius = "8px";

    btnSair.style.cursor = "pointer";

    btnSair.style.marginLeft = "10px";

    btnSair.style.fontWeight = "bold";

    document.querySelector('header')
    .appendChild(btnSair);

    btnSair.addEventListener('click', async () => {

        await signOut(auth);

        window.location.href =
        "login.html";

    });

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

    // MUDANÇA AQUI: ARRAIDEDADOS COMEÇA VAZIO E SINCRONIZA COM O FIREBASE EM TEMPO REAL
    let bancoDados = [];

    onValue(ref(window.db, 'sistemaGestao'), (snapshot) => {
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

    const hoje = new Date();

    filtroMes.value = String(hoje.getMonth() + 1).padStart(2, '0');

    filtroAno.value = String(hoje.getFullYear());

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

                let botaoPdfHtml =
                `<span class="btn-sem-pdf">Sem PDF</span>`;

                if (item.pdfData) {

                    botaoPdfHtml =
                    `<a href="${item.pdfData}" target="_blank" class="btn-pdf">Ver PDF</a>`;

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
                        padding:5px 10px:
                        border-radius:6px;
                        font-weight:bold;
                        color:while;
                        backround:${item.satus==='Pago' ? '#22c55e':
                    '#ef4444'}
                      ">
                        ${item.status ||'Pendente'}
                      </span>
                    </td>

                    <td>${botaoPdHtml}</td>

                    <td>${botaoPdfHtml}</td>

                    <td>

                        <button class="btn-editar" data-index="${index}">

                            Editar

                        </button>

                        <button class="btn-excluir" data-index="${index}">

                            Apagar

                        </button>

                    </td>

                `;

                tabelaCorpo.appendChild(linha);

            }

        });

        qtdRegistros.textContent = contagemItens;

        valorAcumulado.textContent =
        somatorioValores.toLocaleString('pt-BR', {

            style: 'currency',

            currency: 'BRL'

        });

    }

    filtroMes.addEventListener(
        'change',
        filtrarEAtualizarInterface
    );

    filtroAno.addEventListener(
        'change',
        filtrarEAtualizarInterface
    );

    filtroConta.addEventListener(
        'change',
        filtrarEAtualizarInterface
    );

    btnImprimir.addEventListener('click', () => {

        window.print();

    });

    filtrarEAtualizarInterface();

    formGestao.addEventListener('submit', function(event) {

        event.preventDefault();

        const empenhoVal =
        document.getElementById('empenho').value;

        const nfVal =
        document.getElementById('notaFiscal').value;

        const fornecedorVal =
        document.getElementById('fornecedor').value;

        const valorVal =
        document.getElementById('valor').value;

        const dataVal =
        document.getElementByld('data').value;

        const statusVal =
        document.getElementById('status').value;
        item.satus ||'Pendente';

        const arquivoPdfInput =
        document.getElementById('arquivoPdf');

        const idEdicao =
        indexEdicao.value;

        const [anoInput, mesInput] =
        dataVal.split('-');

        function salvarDados(pdfBase64 = null) {

            const novoRegistro = {

                conta: filtroConta.value,

                empenho: empenhoVal,

                notaFiscal: nfVal,

                fornecedor: fornecedorVal,

                valor: valorVal,

                data: dataval,

                status: statusVal,

                pdfData:
                pdfBase64 ||
                (
                    idEdicao !== ""
                    ? bancoDados[idEdicao].pdfData
                    : null
                )

            };

            // MUDANÇA AQUI: SALVANDO OU ATUALIZANDO DIRETO NO FIREBASE
            if (idEdicao === "") {

                const novaRef = push(ref(window.db, 'sistemaGestao'));
                set(novaRef, novoRegistro);

                filtroMes.value = mesInput;

                filtroAno.value = anoInput;

            }

            else {

                const idDoFirebase = bancoDados[idEdicao].firebaseId;
                delete novoRegistro.firebaseId; 
                set(ref(window.db, `sistemaGestao/${idDoFirebase}`), novoRegistro);

                indexEdicao.value = "";

                btnSalvar.textContent =
                "Cadastrar";

                btnSalvar.style.background =
                "#22c55e";

            }

            formGestao.reset();

        }

        if (arquivoPdfInput.files.length > 0) {

            const arquivo =
            arquivoPdfInput.files[0];

            const leitor =
            new FileReader();

            leitor.onload = function(e) {

                salvarDados(e.target.result);

            };

            leitor.readAsDataURL(arquivo);

        }

        else {

            salvarDados();

        }

    });

    tabelaCorpo.addEventListener('click', function(event) {

        const index =
        event.target.getAttribute('data-index');

        if (
            event.target.classList.contains(
                'btn-editar'
            )
        ) {

            const item =
            bancoDados[index];

            document.getElementById('empenho').value =
            item.empenho;

            document.getElementById('notaFiscal').value =
            item.notaFiscal;

            document.getElementById('fornecedor').value =
            item.fornecedor;

            document.getElementById('valor').value =
            item.valor;

            document.getElementById('data').value =
            item.data;

            indexEdicao.value =
            index;

            btnSalvar.textContent =
            "Atualizar Registro";

            btnSalvar.style.background =
            "#3b82f6";

            document
            .getElementById('empenho')
            .focus();

        }

        if (
            event.target.classList.contains(
                'btn-excluir'
            )
        ) {

            if (
                confirm(
                    'Deseja mesmo remover este lançamento?'
                )
            ) {

                // MUDANÇA AQUI: REMOVENDO DIRETO DO BANCO DE DADOS DO FIREBASE
                const idDoFirebase = bancoDados[index].firebaseId;
                remove(ref(window.db, `sistemaGestao/${idDoFirebase}`));

                formGestao.reset();

                indexEdicao.value = "";

                btnSalvar.textContent =
                "Cadastrar";

                btnSalvar.style.background =
                "#22c55e";

            }

        }

    });

});
