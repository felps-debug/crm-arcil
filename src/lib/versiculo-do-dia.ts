/**
 * Versículo do dia, fixo no código.
 *
 * Substitui a liturgia diária, que vinha de uma API pública: dependia de rede,
 * trazia texto longo demais para um cabeçalho e sumia quando a fonte caía.
 * Estes são passagens conhecidas, na tradução Almeida (domínio público),
 * encurtadas para caber em uma linha.
 *
 * A escolha é determinística pelo dia do ano, então todo mundo vê o mesmo
 * versículo no mesmo dia — e ele troca sozinho à meia-noite.
 */
export type Versiculo = { texto: string; referencia: string };

const VERSICULOS: Versiculo[] = [
  { texto: "O Senhor é o meu pastor; nada me faltará.", referencia: "Salmos 23:1" },
  { texto: "Posso todas as coisas naquele que me fortalece.", referencia: "Filipenses 4:13" },
  { texto: "Tudo tem o seu tempo determinado debaixo do céu.", referencia: "Eclesiastes 3:1" },
  { texto: "Confia no Senhor de todo o teu coração e não te estribes no teu próprio entendimento.", referencia: "Provérbios 3:5" },
  { texto: "Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus.", referencia: "Isaías 41:10" },
  { texto: "Todas as coisas contribuem juntamente para o bem daqueles que amam a Deus.", referencia: "Romanos 8:28" },
  { texto: "Deus é o nosso refúgio e fortaleza, socorro bem presente na angústia.", referencia: "Salmos 46:1" },
  { texto: "Buscai primeiro o reino de Deus, e todas estas coisas vos serão acrescentadas.", referencia: "Mateus 6:33" },
  { texto: "Esforça-te e tem bom ânimo; não temas, porque o Senhor teu Deus é contigo.", referencia: "Josué 1:9" },
  { texto: "Vinde a mim, todos os que estais cansados e oprimidos, e eu vos aliviarei.", referencia: "Mateus 11:28" },
  { texto: "Os que esperam no Senhor renovarão as suas forças.", referencia: "Isaías 40:31" },
  { texto: "Entrega o teu caminho ao Senhor; confia nele, e ele o fará.", referencia: "Salmos 37:5" },
  { texto: "Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós.", referencia: "1 Pedro 5:7" },
  { texto: "O amor é sofredor, é benigno; o amor não é invejoso.", referencia: "1 Coríntios 13:4" },
  { texto: "O Senhor é a minha luz e a minha salvação; a quem temerei?", referencia: "Salmos 27:1" },
  { texto: "Confia ao Senhor as tuas obras, e teus pensamentos serão estabelecidos.", referencia: "Provérbios 16:3" },
  { texto: "Não andeis ansiosos por coisa alguma.", referencia: "Filipenses 4:6" },
  { texto: "A fé é o firme fundamento das coisas que se esperam.", referencia: "Hebreus 11:1" },
  { texto: "Levanto os meus olhos para os montes: de onde me virá o socorro?", referencia: "Salmos 121:1" },
  { texto: "O que o Senhor pede de ti: que pratiques a justiça, e ames a misericórdia.", referencia: "Miqueias 6:8" },
  { texto: "Sede fortes no Senhor e na força do seu poder.", referencia: "Efésios 6:10" },
  { texto: "Alegrai-vos na esperança, sede pacientes na tribulação.", referencia: "Romanos 12:12" },
  { texto: "Porque andamos por fé, e não por vista.", referencia: "2 Coríntios 5:7" },
  { texto: "O fruto do Espírito é: amor, alegria, paz, longanimidade, benignidade.", referencia: "Gálatas 5:22" },
  { texto: "Se algum de vós tem falta de sabedoria, peça-a a Deus.", referencia: "Tiago 1:5" },
  { texto: "Ensina a criança no caminho em que deve andar.", referencia: "Provérbios 22:6" },
  { texto: "Aquele que habita no esconderijo do Altíssimo descansará à sombra do Onipotente.", referencia: "Salmos 91:1" },
  { texto: "Sê forte e corajoso; não temas, porque o Senhor teu Deus é quem vai contigo.", referencia: "Deuteronômio 31:6" },
  { texto: "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito.", referencia: "João 3:16" },
  { texto: "Eu sei os pensamentos que tenho a vosso respeito: pensamentos de paz, e não de mal.", referencia: "Jeremias 29:11" },
];

/**
 * O dia é calculado no fuso de São Paulo para que servidor e navegador cheguem
 * ao mesmo índice — do contrário o React acusaria divergência de hidratação
 * durante boa parte do dia.
 */
export function versiculoDoDia(agora: Date = new Date()): Versiculo {
  const emSaoPaulo = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const inicioDoAno = new Date(emSaoPaulo.getFullYear(), 0, 0);
  const diaDoAno = Math.floor((emSaoPaulo.getTime() - inicioDoAno.getTime()) / 86_400_000);
  return VERSICULOS[diaDoAno % VERSICULOS.length];
}
