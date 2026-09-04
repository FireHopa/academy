import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "./generated/prisma/client";

const demoCourses = [
  { title:"Google Ads + Inteligência Artificial", slug:"google-ads-ia", shortDescription:"Estratégia, campanhas e IA aplicada à aquisição de clientes.", category:"google-ads", featured:true, modules:[
    ["Fundamentos",["Estrutura de uma conta moderna","Conversões e sinais","Planejamento de campanhas"]],
    ["Campanhas",["Rede de Pesquisa","Performance Max","Criativos e automações"]],
  ]},
  { title:"AEO: Autoridade nas respostas da IA", slug:"aeo-autoridade", shortDescription:"Prepare sua presença digital para ser entendida e recomendada pelas IAs.", category:"inteligencia-artificial", featured:false, modules:[
    ["Fundamentos",["Como as IAs encontram respostas","Entidades e autoridade","Conteúdo orientado a perguntas"]],
  ]},
  { title:"ChatGPT para Negócios", slug:"chatgpt-negocios", shortDescription:"Use IA na rotina de marketing, vendas e operação.", category:"inteligencia-artificial", featured:false, modules:[
    ["Aplicação",["Prompts com contexto","Rotinas comerciais","Análise e produtividade"]],
  ]},
  { title:"Comercial com IA", slug:"comercial-ia", shortDescription:"Estruture prospecção, atendimento e follow-up com inteligência artificial.", category:"vendas", featured:false, modules:[
    ["Processo comercial",["Jornada do lead","Qualificação","Follow-up inteligente"]],
  ]},
  { title:"Performance Max", slug:"performance-max", shortDescription:"Estruture e otimize campanhas Performance Max com controle estratégico.", category:"google-ads", featured:false, modules:[
    ["Performance Max",["Arquitetura da campanha","Assets e sinais","Otimização"]],
  ]},
  { title:"Conteúdo com IA", slug:"conteudo-ia", shortDescription:"Crie conteúdo útil, consistente e conectado ao posicionamento da marca.", category:"conteudo", featured:false, modules:[
    ["Conteúdo",["Pautas estratégicas","Produção assistida","Distribuição multicanal"]],
  ]},
] as const;

async function main() {
  const production = process.env.NODE_ENV === "production";
  if (production) {
    if (!process.env.ADMIN_EMAIL) {
      throw new Error("Seed bloqueado: em produção defina ADMIN_EMAIL.");
    }
    if (process.env.SEED_DEMO_CONTENT === "true") {
      throw new Error("SEED_DEMO_CONTENT=true é proibido em produção.");
    }
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const email = (process.env.ADMIN_EMAIL ?? "admin@academy.local").toLowerCase();
    const name = process.env.ADMIN_NAME ?? "Administrador";
    const existingAdmin = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });

    if (existingAdmin) {
      if (existingAdmin.role !== "ADMIN") {
        throw new Error(`Seed bloqueado: ADMIN_EMAIL ${email} já pertence a uma conta que não é ADMIN.`);
      }
      console.log(`Admin existente preservado (senha/status não alterados): ${email}`);
    } else {
      const password = process.env.ADMIN_PASSWORD ?? (production ? "" : "TroqueEstaSenha123!");
      if (production && (password.length < 12 || password === "TroqueEstaSenha123!")) {
        throw new Error("Seed bloqueado: para criar o admin em produção defina uma ADMIN_PASSWORD forte, sem usar o valor padrão.");
      }
      const passwordHash = await hash(password, 12);
      await prisma.user.create({ data: { email, name, passwordHash, role: "ADMIN" } });
      console.log(`Admin criado: ${email}`);
    }

    if (process.env.SEED_DEMO_CONTENT !== "true") return;

    const categoryData = [
      ["Google Ads","google-ads"],
      ["Inteligência Artificial","inteligencia-artificial"],
      ["Vendas","vendas"],
      ["Conteúdo","conteudo"],
    ] as const;
    const categories = new Map<string,string>();
    for (const [categoryName,slug] of categoryData) {
      const category = await prisma.category.upsert({ where:{slug}, update:{name:categoryName}, create:{name:categoryName,slug} });
      categories.set(slug,category.id);
    }

    const createdCourses = new Map<string,string>();
    for (const item of demoCourses) {
      const categoryId = categories.get(item.category)!;
      const course = await prisma.course.upsert({
        where:{slug:item.slug},
        update:{ title:item.title, shortDescription:item.shortDescription, featured:item.featured, status:"PUBLISHED", publishedAt:new Date(), categories:{set:[{id:categoryId}]} },
        create:{ title:item.title, slug:item.slug, shortDescription:item.shortDescription, description:item.shortDescription, featured:item.featured, status:"PUBLISHED", publishedAt:new Date(), categories:{connect:[{id:categoryId}]} },
      });
      createdCourses.set(item.slug,course.id);
      const moduleCount = await prisma.courseModule.count({where:{courseId:course.id}});
      if (!moduleCount) {
        for (let moduleIndex=0; moduleIndex<item.modules.length; moduleIndex++) {
          const [moduleTitle,lessons] = item.modules[moduleIndex];
          const module = await prisma.courseModule.create({data:{courseId:course.id,title:moduleTitle,position:moduleIndex+1}});
          for (let lessonIndex=0;lessonIndex<lessons.length;lessonIndex++) {
            await prisma.lesson.create({data:{moduleId:module.id,title:lessons[lessonIndex],position:lessonIndex+1,published:true,durationSec:900+(lessonIndex*240)}});
          }
        }
      }
    }

    const studentEmail=(process.env.STUDENT_EMAIL??"aluno@academy.local").toLowerCase();
    let student=await prisma.user.findUnique({where:{email:studentEmail}});
    if(student){
      if(student.role!=="STUDENT") throw new Error(`Seed demo bloqueado: STUDENT_EMAIL ${studentEmail} já pertence a uma conta que não é STUDENT.`);
      console.log(`Aluno demo existente preservado (senha/status não alterados): ${studentEmail}`);
    } else {
      const studentPassword=process.env.STUDENT_PASSWORD??"Aluno123!";
      student=await prisma.user.create({data:{email:studentEmail,name:process.env.STUDENT_NAME??"Aluno Demo",passwordHash:await hash(studentPassword,12),role:"STUDENT"}});
      console.log(`Aluno demo criado: ${studentEmail}`);
    }
    for (const slug of ["google-ads-ia","aeo-autoridade","chatgpt-negocios","comercial-ia"]) {
      const courseId=createdCourses.get(slug)!;
      await prisma.enrollment.upsert({where:{userId_courseId:{userId:student.id,courseId}},update:{status:"ACTIVE",expiresAt:null},create:{userId:student.id,courseId,status:"ACTIVE",source:"seed-demo"}});
    }
    for (const slug of ["google-ads-ia","aeo-autoridade"]) {
      const courseId=createdCourses.get(slug)!;
      await prisma.favorite.upsert({where:{userId_courseId:{userId:student.id,courseId}},update:{},create:{userId:student.id,courseId}});
    }
    const firstCourseId=createdCourses.get("google-ads-ia")!;
    const firstLessons=await prisma.lesson.findMany({where:{module:{courseId:firstCourseId}},orderBy:[{module:{position:"asc"}},{position:"asc"}],take:3});
    if(firstLessons[0]) await prisma.lessonProgress.upsert({where:{userId_lessonId:{userId:student.id,lessonId:firstLessons[0].id}},update:{completed:true,positionSec:firstLessons[0].durationSec??0,completedAt:new Date()},create:{userId:student.id,lessonId:firstLessons[0].id,completed:true,positionSec:firstLessons[0].durationSec??0,completedAt:new Date()}});
    if(firstLessons[1]) await prisma.lessonProgress.upsert({where:{userId_lessonId:{userId:student.id,lessonId:firstLessons[1].id}},update:{completed:false,positionSec:420},create:{userId:student.id,lessonId:firstLessons[1].id,completed:false,positionSec:420}});

    if(firstLessons[1]) {
      const chapterCount=await prisma.lessonChapter.count({where:{lessonId:firstLessons[1].id}});
      if(!chapterCount){
        await prisma.lessonChapter.createMany({data:[
          {lessonId:firstLessons[1].id,title:"Por que conversões são o centro da estratégia",startSec:0,position:1},
          {lessonId:firstLessons[1].id,title:"Eventos e sinais de qualidade",startSec:265,position:2},
          {lessonId:firstLessons[1].id,title:"Como organizar a mensuração",startSec:610,position:3},
        ]});
      }
      const materialCount=await prisma.lessonMaterial.count({where:{lessonId:firstLessons[1].id}});
      if(!materialCount){
        await prisma.lessonMaterial.createMany({data:[
          {lessonId:firstLessons[1].id,title:"Checklist de conversões",type:"CHECKLIST",url:"https://example.com/checklist-conversoes.pdf",position:1},
          {lessonId:firstLessons[1].id,title:"Planilha de planejamento",type:"SPREADSHEET",url:"https://example.com/planejamento.xlsx",position:2},
        ]});
      }
      await prisma.lessonTranscript.upsert({where:{lessonId:firstLessons[1].id},update:{content:"Nesta aula vamos entender por que a conversão é o principal sinal para orientar decisões de mídia.\n\nPrimeiro, vamos separar conversão de negócio de microconversões. Nem todo evento deve ter o mesmo peso dentro da estratégia.\n\nDepois, organizamos os sinais que ajudam a plataforma a compreender quais leads realmente possuem qualidade e quais eventos devem ser usados para otimização.\n\nPor fim, montamos uma estrutura de mensuração simples, documentada e que pode evoluir conforme a maturidade da conta.",language:"pt-BR"},create:{lessonId:firstLessons[1].id,content:"Nesta aula vamos entender por que a conversão é o principal sinal para orientar decisões de mídia.\n\nPrimeiro, vamos separar conversão de negócio de microconversões. Nem todo evento deve ter o mesmo peso dentro da estratégia.\n\nDepois, organizamos os sinais que ajudam a plataforma a compreender quais leads realmente possuem qualidade e quais eventos devem ser usados para otimização.\n\nPor fim, montamos uma estrutura de mensuração simples, documentada e que pode evoluir conforme a maturidade da conta.",language:"pt-BR"}});
    }

    const paths=[
      {title:"Aquisição de clientes com IA",slug:"aquisicao-com-ia",description:"Do tráfego pago à autoridade nas respostas de IA.",position:1,courses:["google-ads-ia","performance-max","aeo-autoridade"]},
      {title:"IA aplicada ao negócio",slug:"ia-aplicada-negocio",description:"Uma sequência prática para marketing, conteúdo e vendas.",position:2,courses:["chatgpt-negocios","conteudo-ia","comercial-ia"]},
    ];
    for(const item of paths){
      const path=await prisma.learningPath.upsert({where:{slug:item.slug},update:{title:item.title,description:item.description,published:true,position:item.position},create:{title:item.title,slug:item.slug,description:item.description,published:true,position:item.position}});
      await prisma.learningPathCourse.deleteMany({where:{learningPathId:path.id}});
      for(let i=0;i<item.courses.length;i++) await prisma.learningPathCourse.create({data:{learningPathId:path.id,courseId:createdCourses.get(item.courses[i])!,position:i+1}});
    }

    const noticeExists = await prisma.notification.findFirst({ where: { userId: student.id, title: "Bem-vindo à Casa do Ads" } });
    if (!noticeExists) await prisma.notification.create({ data: { userId: student.id, title: "Bem-vindo à Casa do Ads", message: "Sua biblioteca de cursos já está disponível. Continue de onde parou e acompanhe seus avisos por aqui.", linkUrl: "/library" } });

    console.log(`Aluno demo: ${studentEmail}`);
    console.log("Conteúdo demo, categorias, biblioteca e trilhas criados/atualizados.");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
