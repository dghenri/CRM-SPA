import React from 'react'
import { Button, Card, ScrollShadow } from "@heroui/react";

const PRIVACY_POLICY_TEXT =
<>
  <br/>
  <strong>Política do Riviera SPA</strong>
  <br/>
  • É política do Riviera SPA respeitar a sua privacidade em relação a qualquer informação sua que possamos coletar no site Riviera SPA, e outros sites que possuímos e operamos. Solicitamos informações pessoais apenas quando realmente precisamos delas para lhe fornecer um serviço. Fazemo-lo por meios justos e legais, com o seu conhecimento e consentimento. Também informamos por que estamos coletando e como será usado. Apenas retemos as informações coletadas pelo tempo necessário para fornecer o serviço solicitado. Quando armazenamos dados, protegemos dentro de meios comercialmente aceitáveis ​​para evitar perdas e roubos, bem como acesso, divulgação, cópia, uso ou modificação não autorizados. Não compartilhamos informações de identificação pessoal publicamente ou com terceiros, exceto quando exigido por lei. O nosso site pode ter links para sites externos que não são operados por nós. Esteja ciente de que não temos controle sobre o conteúdo e práticas desses sites e não podemos aceitar responsabilidade por suas respectivas políticas de privacidade.
  <br/>
  <br/>
  • Você é livre para recusar a nossa solicitação de informações pessoais, entendendo que talvez não possamos fornecer alguns dos serviços desejados. O uso continuado de nosso site será considerado como aceitação de nossas práticas em torno de privacidade e informações pessoais. Se você tiver alguma dúvida sobre como lidamos com dados do usuário e informações pessoais, entre em contacto connosco.
  <br/>
  <br/>
  • O serviço Google AdSense que usamos para veicular publicidade usa um cookie DoubleClick para veicular anúncios mais relevantes em toda a Web e limitar o número de vezes que um determinado anúncio é exibido para você. Para mais informações sobre o Google AdSense, consulte as FAQs oficiais sobre privacidade do Google AdSense. Utilizamos anúncios para compensar os custos de funcionamento deste site e fornecer financiamento para futuros desenvolvimentos. Os cookies de publicidade comportamental usados ​​por este site foram projetados para garantir que você forneça os anúncios mais relevantes sempre que possível, rastreando anonimamente seus interesses e apresentando coisas semelhantes que possam ser do seu interesse.
  <br/>
  <br/>
  • Vários parceiros anunciam em nosso nome e os cookies de rastreamento de afiliados simplesmente nos permitem ver se nossos clientes acessaram o site através de um dos sites de nossos parceiros, para que possamos creditá-los adequadamente e, quando aplicável, permitir que nossos parceiros afiliados ofereçam qualquer promoção que pode fornecê-lo para fazer uma compra.
  <br/>
  <br/>
  <strong>Compromisso do Usuário</strong>
  <br/>
  
  • O usuário se compromete a fazer uso adequado dos conteúdos e da informação que o Riviera SPA oferece no site e com caráter enunciativo, mas não limitativo:
  <br/>
  <br/>
  <strong>A)</strong> Não se envolver em atividades que sejam ilegais ou contrárias à boa fé a à ordem pública;
  <br/>
  <strong>B)</strong> Não difundir propaganda ou conteúdo de natureza racista, xenofóbica, jogos de sorte ou azar, qualquer tipo de pornografia ilegal, de apologia ao terrorismo ou contra os direitos humanos;
  <br/>
  <strong>C)</strong> Não causar danos aos sistemas físicos (hardwares) e lógicos (softwares) do Riviera SPA, de seus fornecedores ou terceiros, para introduzir ou disseminar vírus informáticos ou quaisquer outros sistemas de hardware ou software que sejam capazes de causar danos anteriormente mencionados.
  <br/>
  <br/>
  <strong>Mais informações</strong>
  <br/>
  • Esperemos que esteja esclarecido e, como mencionado anteriormente, se houver algo que você não tem certeza se precisa ou não, geralmente é mais seguro deixar os cookies ativados, caso interaja com um dos recursos que você usa em nosso site.
  <br/>
  <br/>
  Esta política é efetiva a partir de<strong> 8 Setembro de 2026 às 16:23</strong>
</>

export function TermsCard({
  className = "",
  onAccept,
  onCancel,
  cancelLabel = "Cancelar",
  acceptLabel = "Aceitar",
}) {
  return (
    <Card className="h-screen">
      <Card.Header>
        <Card.Title>Política de Privacidade</Card.Title>
        <Card.Description>Leia com atenção antes de continuar</Card.Description>
      </Card.Header>
      <Card.Content className="p-0">
        <ScrollShadow color="bg-danger" className="h-200 px-4" size={80}>
          <div className="space-y-4">
            <p>{PRIVACY_POLICY_TEXT}</p>
          </div>
        </ScrollShadow>
      </Card.Content>
      <Card.Footer className="fixed inset-x-0 bottom-8 mt-4 flex flex-row gap-2 px-10">
        <Button className="w-full" variant="secondary" onPress={onCancel}>
          {cancelLabel}
        </Button>
        <Button className="w-full" onPress={onAccept}>
          {acceptLabel}
        </Button>
      </Card.Footer>
    </Card>
  );
}

const Terms = () => {
  return (
    <div>
      <TermsCard className="max-w-100" />
    </div>
  );
};

export default Terms;
