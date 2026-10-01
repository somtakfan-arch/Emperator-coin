#!/usr/bin/env python3
"""Генерирует ustav.html, kodeks.html, order.html (общий стиль — doc.css, герб — из dogovor.html)."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'dogovor.html'), encoding='utf-8').read()
DEFS = src[src.index('<svg width="0"'):src.index('</defs></svg>') + len('</defs></svg>')]
ORG = 'ФИЛИПОВСКАЯ СЛУЖБА ИСПОЛНЕНИЯ НАКАЗАНИЙ'


def head(right=''):
    return f'''<svg class="wm"><use href="#embL"/></svg>
 <div class="head"><svg><use href="#emb"/></svg>
  <div class="t"><div class="org">ФСИН</div><div class="sub">{ORG}</div></div>
  <div class="no">{right}</div></div>'''


def doc(title, pages):
    body = ''.join(f'<div class="page">{p}</div>\n' for p in pages)
    return f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>{title}</title>
<link rel="stylesheet" href="doc.css"></head><body>
{DEFS}
{body}</body></html>
'''


def ol(n, items):
    return f'<ol style="--s:\'{n}\'">' + ''.join(f'<li>{i}</li>' for i in items) + '</ol>'


def chapter(n, name, items):
    return f'<h2>Глава {n}. {name}</h2>' + ol(n, items)


# ───────────────────────── УСТАВ ─────────────────────────
RANKS = [
    ('Рядовой состав', 'Рядовой'),
    ('Сержантский состав', 'Мл. сержант · Сержант<br>Ст. сержант · Старшина'),
    ('Прапорщики', 'Прапорщик'),
    ('Младшие офицеры', 'Мл. лейтенант · Лейтенант<br>Ст. лейтенант · Капитан'),
    ('Старшие офицеры', 'Майор · Подполковник<br>Полковник'),
    ('Высший состав', 'Генерал-майор<br>Генерал-лейтенант<br>Генерал-полковник'),
]
ranks = '<div class="ranks">' + ''.join(f'<div><b>{a}</b>{b}</div>' for a, b in RANKS) + '</div>'

ustav_p1 = head('УТВЕРЖДЁН<br>Лидером ФСИН') + '''
 <h1 class="big">УСТАВ</h1>
 <div class="h1sub">Филиповской службы исполнения наказаний</div>
''' + chapter(1, 'Общие положения', [
    'Филиповская служба исполнения наказаний (далее — ФСИН) — добровольное объединение учеников, созданное для поддержания порядка, взаимовыручки и чести своих.',
    'Девиз ФСИН: «Честь. Порядок. Верность своим».',
    'Символы ФСИН: герб — щит с короной; цвета — чёрный и серебряный.',
    'Деятельность ФСИН не может нарушать правила школы и законы Российской Федерации. Любой приказ, который их нарушает, недействителен.',
]) + chapter(2, 'Структура', [
    'Высшее должностное лицо — <b>Лидер ФСИН</b>. Он назначает руководителей отделов, утверждает приказы и ордера.',
    '<b>Совет генералов</b> — все сотрудники в генеральских званиях. Совет утверждает изменения Устава и присвоение генеральских званий.',
    'Отделы ФСИН: <b>Отдел задержания</b>; <b>Отдел кадров</b>; <b>Коллегия адвокатов</b>; <b>Спецвойска</b>; <b>Танковые войска</b>; <b>Воздушные войска</b>. Новые отделы создаются приказом Лидера.',
    'Отдел кадров ведёт реестр сотрудников и выдаёт удостоверения. Коллегия адвокатов защищает сотрудников на разбирательствах.',
]) + chapter(3, 'Звания', [
    'В ФСИН установлены 16 званий:' + ranks,
    'Звания до полковника включительно присваивает Отдел кадров по представлению руководителя отдела. Генеральские звания — Лидер с согласия Совета генералов.',
    'Звание подтверждается служебным удостоверением.',
]) + chapter(4, 'Вступление и выход', [
    'Для вступления кандидат заполняет анкету, подписывает Договор о вступлении и принимает присягу.',
    'После вступления сотруднику выдаётся служебное удостоверение с личным номером (100–999).',
    'Сотрудник вправе выйти из ФСИН в любой момент, сообщив об этом Лидеру и вернув удостоверение.',
]) + '<div class="pno">стр. 1 из 2</div>'

ustav_p2 = head('УСТАВ<br>стр. 2') + chapter(5, 'Права и обязанности', [
    'Каждый сотрудник обязан соблюдать настоящий Устав и Кодекс ФСИН, хранить внутренние дела ФСИН и уважать других сотрудников.',
    'Каждый сотрудник вправе участвовать в операциях своего отдела, получать повышение за заслуги и пользоваться защитой Коллегии адвокатов.',
    'Полномочия сотрудника указаны на обороте его удостоверения.',
]) + chapter(6, 'Правосудие', [
    'Нарушения и взыскания определяются Кодексом ФСИН. Взыскание без разбирательства не допускается.',
    'Кодекс ФСИН действует <b>для всех учеников</b>. Задержание проводит Отдел задержания по Ордеру и <b>только с согласия</b> задерживаемого.',
    'Места содержания: <b>Тюрьма</b> — кабинки туалета; <b>КПЗ</b> — туалет; <b>Допросная</b> — раздевалка. Правила содержания установлены Кодексом ФСИН.',
    'Ордер на задержание выдаёт Лидер ФСИН или назначенный им судья.',
    'На разбирательстве (Суде ФСИН): судья — Лидер или назначенный генерал; обвинение — Отдел задержания; защита — Коллегия адвокатов или сам сотрудник.',
    'Решение суда можно обжаловать Лидеру ФСИН в течение 3 дней. Решение Лидера окончательное.',
]) + chapter(7, 'Поощрения', [
    'За заслуги применяются: благодарность, досрочное повышение в звании, почётная грамота, орден «За верность».',
    'Поощрение снимает ранее наложенное взыскание.',
]) + chapter(8, 'Изменение Устава', [
    'Изменения в Устав вносит Лидер ФСИН с согласия большинства Совета генералов.',
    'Устав вступает в силу с момента утверждения и обязателен для всех сотрудников ФСИН.',
]) + '''
 <div class="sig" style="margin-top:8mm">
  <div class="col"><b>Утверждаю</b><small>Лидер ФСИН</small><div class="ln"></div><small>подпись / ФИО</small></div>
  <div class="col"><b>Согласовано</b><small>Совет генералов</small><div class="ln"></div><small>подписи</small></div>
 </div>
 <div class="mp">М.П.</div>
 <div class="pno">стр. 2 из 2</div>'''

# ───────────────────────── КОДЕКС ─────────────────────────
def art(no, name, text, sanction):
    return f'''<div class="art"><div class="t"><span>Статья {no}.</span>{name}</div>
 <p>{text}</p><p class="sn"><b>Взыскание:</b> {sanction}</p></div>'''


koap = [
    ('1', 'Задирание', 'Задирание, толкание, обидные подколы в адрес любого ученика.', 'задержание, КПЗ; при повторе — тюрьма 1 перемена.'),
    ('2', 'Неуважение к ФСИН', 'Насмешки над ФСИН, её символами или удостоверением.', 'предупреждение; при повторе — КПЗ.'),
    ('3', 'Неявка по ордеру', 'Отказ явиться на разбирательство по Ордеру.', 'разбирательство проводится заочно.'),
    ('4', 'Опоздание, неявка', '<i>Для сотрудников.</i> Опоздание или неявка на сбор/операцию без уважительной причины.', 'предупреждение или выговор.'),
    ('5', 'Невыполнение приказа', '<i>Для сотрудников.</i> Невыполнение законного приказа руководителя.', 'выговор или наряд.'),
    ('6', 'Удостоверение', '<i>Для сотрудников.</i> Утеря, порча удостоверения; отсутствие его на операции.', 'предупреждение.'),
]
uk = [
    ('101', 'Оскорбление сотрудника', 'Оскорбление сотрудника ФСИН при исполнении служебных обязанностей.', 'тюрьма 1–2 перемены.'),
    ('102', 'Травля', 'Систематическое задирание или унижение ученика.', 'тюрьма до 3 перемен; дело передаётся классному руководителю.'),
    ('103', 'Драка', 'Участие в драке. Сотрудники ФСИН не разнимают руками — зовут дежурного учителя.', 'тюрьма 2 перемены.'),
    ('104', 'Превышение полномочий', '<i>Для сотрудников.</i> Задержание без согласия; запирание дверей; применение силы; удержание после слова «стоп»; съёмка задержанного; обыск и отбор вещей.', 'изъятие удостоверения до 1 месяца; при повторе — исключение.'),
    ('105', 'Измена', '<i>Для сотрудников.</i> Переход к соперникам ФСИН с передачей тайн.', 'исключение из ФСИН.'),
    ('106', 'Разглашение тайны', '<i>Для сотрудников.</i> Разглашение важных внутренних дел ФСИН.', 'понижение на 1–2 звания.'),
    ('107', 'Самозванство', 'Присвоение звания без приказа; подделка удостоверения или ордера.', 'лишение звания; для не-сотрудника — КПЗ.'),
    ('108', 'Ложный донос', 'Заведомо ложное обвинение в нарушении.', 'то взыскание, которое грозило обвинённому.'),
]
kodeks_p1 = head('КОДЕКС<br>ФСИН') + '''
 <h1 class="big">КОДЕКС ФСИН</h1>
 <div class="h1sub">о нарушениях и взысканиях</div>
''' + '<h2>Общие положения</h2>' + ol('0', [
    'Кодекс действует <b>для всех учеников</b>. Статьи с пометкой «для сотрудников» — только для сотрудников ФСИН.',
    'Взыскания: предупреждение, <b>КПЗ</b> (туалет, до 5 минут), <b>тюрьма</b> (кабинка туалета, до конца перемены; срок считается в переменах), <b>допрос</b> (раздевалка, с адвокатом); для сотрудников также выговор, наряд, понижение в звании, исключение. Денежные штрафы запрещены.',
    'Каждый обвиняемый имеет право на защиту Коллегии адвокатов. Взыскание снимается через 1 месяц без новых нарушений.',
]) + '<h2>Правила задержания и содержания</h2>' + ol('П', [
    'Задержание — <b>только с согласия</b> ученика. Отказался — дело рассматривается заочно.',
    'Задержанный в любой момент может сказать <b>«СТОП»</b> — содержание сразу прекращается, он свободен.',
    'Двери не запираются. Толкать, держать руками, обыскивать, отбирать вещи и снимать на телефон запрещено.',
    'Содержание — только на перемене. Со звонком на урок все задержанные свободны.',
]) + '<div class="part">Часть I. Административные нарушения (КоАП ФСИН)</div>' + ''.join(art(*a) for a in koap) + '<div class="pno">стр. 1 из 2</div>'

kodeks_p2 = head('КОДЕКС<br>стр. 2') + '<div class="part" style="margin-top:4mm">Часть II. Тяжкие нарушения (УК ФСИН)</div>' + ''.join(art(*a) for a in uk) + '''
 <div class="box" style="margin-top:4mm"><p><b>Порядок.</b> Нарушение → Ордер на задержание → вызов на разбирательство → Суд ФСИН (судья, обвинение, защита) → решение → обжалование Лидеру в течение 3 дней.</p></div>
 <div class="sig" style="margin-top:6mm">
  <div class="col"><b>Утверждаю</b><small>Лидер ФСИН</small><div class="ln"></div><small>подпись / ФИО</small></div>
  <div class="col"><b>Согласовано</b><small>Совет генералов</small><div class="ln"></div><small>подписи</small></div>
 </div>
 <div class="mp">М.П.</div>
 <div class="pno">стр. 2 из 2</div>'''

# ───────────────────────── ПРОЦЕССУАЛЬНЫЙ КОДЕКС ─────────────────────────
proc_p1 = head('ПК ФСИН<br>для сотрудников') + '''
 <h1 class="big">ПРОЦЕССУАЛЬНЫЙ КОДЕКС</h1>
 <div class="h1sub">порядок действий сотрудников ФСИН</div>
''' + chapter(1, 'Основания', [
    'Сотрудник действует только на основании Кодекса ФСИН и Ордера на задержание. Без ордера задержание допускается только при нарушении, совершённом на глазах у сотрудника; ордер оформляется в тот же день.',
    'Во время исполнения обязанностей сотрудник обязан иметь при себе служебное удостоверение.',
]) + chapter(2, 'Порядок задержания', [
    'Подойти к ученику, представиться и показать удостоверение.',
    'Объявить статью Кодекса и суть нарушения.',
    'Спросить согласие ученика. Согласие должно быть ясным: «да», «согласен».',
    'Согласился — сопроводить в место содержания. Отказался — задержание не проводится, в ордере отмечается «отказ», дело рассматривается заочно.',
    'Отметить в ордере время задержания и место содержания, получить подпись задержанного «Согласен».',
]) + '''<div class="box"><p><b>Формула задержания:</b> «Сотрудник ФСИН <i>[звание, фамилия]</i>, удостоверение № <i>[номер]</i>. Вы задерживаетесь по статье <i>[номер]</i> Кодекса ФСИН за <i>[нарушение]</i>. Вы можете сказать «стоп» в любой момент и имеете право на адвоката. Согласны пройти?»</p></div>''' + chapter(3, 'Содержание', [
    'КПЗ — не более 5 минут; тюрьма — до конца перемены. Срок в несколько перемен отбывается по одной перемене.',
    'У места содержания находится дежурный сотрудник. Он следит за соблюдением правил и отпускает задержанного по окончании срока.',
    'По слову «СТОП» или звонку на урок задержанный немедленно освобождается. Оставшийся срок по решению судьи может быть перенесён на следующую перемену.',
]) + '<div class="pno">стр. 1 из 2</div>'

proc_p2 = head('ПК ФСИН<br>стр. 2') + chapter(4, 'Допрос', [
    'Допрос проводится в допросной (раздевалке) сотрудником Отдела задержания в присутствии адвоката, если задержанный его попросил.',
    'Перед допросом задержанному разъясняются права: не отвечать на вопросы, пригласить адвоката, сказать «стоп».',
    'Вопросы задаются только по делу. Крик, угрозы и давление запрещены.',
    'Ответы кратко записываются в ордер или журнал ФСИН.',
]) + chapter(5, 'Суд ФСИН', [
    'Суд проводится в течение 2 дней после задержания. Состав: судья (Лидер или назначенный генерал), обвинитель (Отдел задержания), защитник (Коллегия адвокатов).',
    'Ход заседания: 1) судья объявляет дело; 2) обвинитель излагает нарушение и доказательства (свидетели, фото, записи); 3) защитник и обвиняемый дают объяснения; 4) последнее слово обвиняемого; 5) судья объявляет решение.',
    'Возможные решения: оправдать; назначить взыскание по статье Кодекса; прекратить дело за примирением сторон.',
    'Все сомнения толкуются в пользу обвиняемого.',
]) + chapter(6, 'Обжалование и помилование', [
    'Жалоба подаётся Лидеру ФСИН в течение 3 дней. Лидер может отменить, смягчить решение или оставить его в силе.',
    'Лидер вправе помиловать осуждённого полностью или частично.',
]) + chapter(7, 'Документы и учёт', [
    'Ордер на задержание — выдаётся до задержания, хранится у Отдела задержания.',
    '<b>Журнал ФСИН</b> — ведёт Отдел кадров: дата, ФИО, статья, решение суда, отметка об исполнении.',
    'Сотрудник, нарушивший настоящий кодекс, отвечает по статье 104 Кодекса ФСИН (превышение полномочий).',
]) + '''
 <div class="sig" style="margin-top:6mm">
  <div class="col"><b>Утверждаю</b><small>Лидер ФСИН</small><div class="ln"></div><small>подпись / ФИО</small></div>
  <div class="col"><b>Ознакомлен</b><small>Сотрудник ФСИН</small><div class="ln"></div><small>подпись / ФИО</small></div>
 </div>
 <div class="mp">М.П.</div>
 <div class="pno">стр. 2 из 2</div>'''

# ───────────────────────── СЛОВАРЬ ─────────────────────────
TERMS = [
    ('Адвокат', 'сотрудник Коллегии адвокатов, защищающий задержанного на допросе и в Суде ФСИН.'),
    ('Амнистия', 'снятие взысканий сразу со многих осуждённых по приказу Лидера (например, к празднику).'),
    ('Взыскание', 'наказание по Кодексу ФСИН: предупреждение, КПЗ, тюрьма, выговор, наряд, понижение, исключение.'),
    ('Выговор', 'официальное порицание сотрудника. Три выговора за четверть — понижение в звании.'),
    ('Дежурный', 'сотрудник у места содержания. Следит за правилами и отпускает задержанного по окончании срока.'),
    ('Дело', 'всё, что касается одного нарушения: ордер, объяснения, свидетели, решение суда.'),
    ('Допрос', 'беседа с задержанным по делу в допросной. Без крика и давления, по желанию — с адвокатом.'),
    ('Допросная', 'место для допроса — раздевалка.'),
    ('Доказательства', 'то, что подтверждает нарушение: показания свидетелей, фото, записи.'),
    ('Журнал ФСИН', 'книга учёта дел: дата, ФИО, статья, решение, исполнение. Ведёт Отдел кадров.'),
    ('Задержание', 'доставка ученика в место содержания или на разбирательство по ордеру. Только с согласия.'),
    ('Задержанный', 'ученик, который согласился на задержание и находится под надзором ФСИН.'),
    ('Заочно', 'рассмотрение дела без обвиняемого — если он отказался от задержания или не явился.'),
    ('Звание', 'ступень в ФСИН — от рядового до генерал-полковника. Указывается в удостоверении.'),
    ('КоАП ФСИН', 'Часть I Кодекса — лёгкие нарушения (статьи 1–6).'),
    ('Кодекс ФСИН', 'перечень нарушений и взысканий. Действует для всех учеников.'),
    ('Корочка', 'разг. служебное удостоверение.'),
    ('КПЗ', 'камера предварительного заключения — туалет, до 5 минут.'),
    ('Лидер ФСИН', 'высшее должностное лицо. Утверждает приказы и ордера, милует, решает жалобы.'),
    ('Миранда', 'права задержанного, которые обязательно зачитываются при задержании («зачитать Миранду»): право сказать «стоп», право молчать, право на адвоката.'),
    ('Наряд', 'одно поручение на пользу ФСИН для сотрудника, не дольше дня.'),
    ('Обвинитель', 'сотрудник Отдела задержания, излагающий нарушение в Суде ФСИН.'),
    ('Обжалование', 'жалоба Лидеру на решение суда в течение 3 дней.'),
    ('Операция', 'запланированное задание отдела ФСИН.'),
    ('Оправдать', 'признать обвиняемого невиновным. Взыскание не назначается.'),
    ('Ордер', 'бланк с приказом о задержании: кого, по какой статье, куда и на какой срок.'),
    ('Отказ', 'несогласие ученика на задержание. Задержание не проводится, дело идёт заочно.'),
    ('Отдел', 'подразделение ФСИН: задержания, кадров, адвокатура, спецвойска, танковые и воздушные войска.'),
    ('Помилование', 'полная или частичная отмена взыскания Лидером.'),
    ('Последнее слово', 'право обвиняемого высказаться в суде перед решением.'),
    ('Превышение полномочий', 'нарушение правил задержания сотрудником (ст. 104): без согласия, сила, запертая дверь, удержание после «стоп».'),
    ('Презумпция невиновности', 'пока вина не доказана — человек невиновен. Все сомнения — в пользу обвиняемого.'),
    ('При исполнении', 'сотрудник выполняет задание ФСИН и имеет при себе удостоверение.'),
    ('Примирение сторон', 'стороны помирились — судья может прекратить дело.'),
    ('Присяга', 'клятва при вступлении: «хранить честь ФСИН, стоять за своих и соблюдать Устав».'),
    ('Протокол', 'краткая запись допроса или заседания в ордере или журнале.'),
    ('Процессуалка', 'разг. Процессуальный кодекс ФСИН — порядок действий сотрудников.'),
    ('Свидетель', 'тот, кто видел нарушение и рассказывает об этом в суде.'),
    ('Совет генералов', 'все сотрудники в генеральских званиях. Утверждает изменения Устава.'),
    ('Сотрудник', 'член ФСИН, подписавший договор и принявший присягу.'),
    ('Срок', 'время тюрьмы, считается в переменах. Отбывается по одной перемене.'),
    ('«Стоп»', 'стоп-слово. Задержанный говорит «стоп» — и сразу свободен.'),
    ('Суд ФСИН', 'разбирательство дела: судья, обвинитель, защитник. Проводится в течение 2 дней.'),
    ('Судья', 'Лидер или назначенный им генерал. Ведёт суд и выносит решение.'),
    ('Тюрьма', 'кабинка туалета, до конца перемены.'),
    ('УК ФСИН', 'Часть II Кодекса — тяжкие нарушения (статьи 101–108).'),
    ('Удостоверение', 'документ сотрудника с фото, званием и номером (100–999).'),
    ('Устав', 'основной закон ФСИН: структура, звания, вступление, правосудие.'),
    ('Формула задержания', 'фраза, которую сотрудник говорит при задержании (см. Процессуалку, гл. 2).'),
]
dl = lambda items: '<div class="gl">' + ''.join(f'<p><b>{t}</b> — {d}</p>' for t, d in items) + '</div>'
half = 25
slovar_p1 = head('СЛОВАРЬ<br>ФСИН') + '''
 <h1 class="big">СЛОВАРЬ ТЕРМИНОВ</h1>
 <div class="h1sub">Филиповской службы исполнения наказаний</div>
''' + dl(TERMS[:half]) + '<div class="pno">стр. 1 из 2</div>'
slovar_p2 = head('СЛОВАРЬ<br>стр. 2') + '<div style="height:4mm"></div>' + dl(TERMS[half:]) + '''
 <div class="box" style="margin-top:4mm"><p><b>Миранда (зачитывается при задержании):</b> «Вы можете сказать „стоп“ в любой момент и уйти. Вы имеете право молчать. Вы имеете право на адвоката Коллегии адвокатов ФСИН. Вам понятны ваши права?»</p></div>
 <div class="pno">стр. 2 из 2</div>'''

# ───────────────────────── ОРДЕР (2 на лист) ─────────────────────────
order_one = '''<div class="ord">
 <div class="head"><svg><use href="#emb"/></svg>
  <div class="t"><div class="org">ФСИН</div><div class="sub">''' + ORG + '''</div></div>
  <div class="no">ОРДЕР<br>№ <span class="blank s"></span></div></div>
 <h1>ОРДЕР НА ЗАДЕРЖАНИЕ</h1>
 <div class="place"><span>г. Москва</span><span>«____» ______________ 20___ г.</span></div>
 <p class="row2">Отделу задержания ФСИН поручается задержать ученика:</p>
 <p class="row2">ФИО <span class="blank xl"></span></p>
 <p class="row2">Класс <span class="blank s"></span> Звание / № удостоверения (для сотрудников) <span class="blank"></span></p>
 <p class="row2">Основание: статья <span class="blank s"></span> <span class="ck">☐ КоАП</span> <span class="ck">☐ УК</span> Кодекса ФСИН</p>
 <p class="row2">Суть нарушения <span class="blank xl2"></span></p>
 <p class="row2">Место: <span class="ck">☐ КПЗ</span> <span class="ck">☐ Тюрьма</span> <span class="ck">☐ Допросная</span> Срок: <span class="blank s"></span> перемен</p>
 <p class="row2">Явиться на разбирательство: место <span class="blank"></span> время <span class="blank s"></span></p>
 <div class="box"><p>Задержание — только с согласия. Задержанный может сказать «СТОП» и уйти в любой момент. Двери не запираются, сила запрещена. Право на адвоката.</p></div>
 <div class="sig">
  <div class="col"><b>Выдал</b><small>Лидер / судья ФСИН</small><div class="ln"></div><small>подпись / ФИО</small></div>
  <div class="col"><b>Исполнил</b><small>Отдел задержания</small><div class="ln"></div><small>подпись / ФИО, дата</small></div>
  <div class="col"><b>Согласен</b><small>Задержанный</small><div class="ln"></div><small>подпись</small></div>
 </div>
 <div class="mpo">М.П.</div>
</div>'''
order_css = '''<style>
.page.two{padding:0;display:flex;flex-direction:column}
.page.two::before,.page.two::after{display:none}
.ord{height:148.5mm;padding:12mm 16mm 10mm;position:relative}
.ord::before{content:"";position:absolute;inset:6mm;border:0.5mm solid #15161b}
.ord+.ord{border-top:0.3mm dashed #999}
.ord h1{margin:3mm 0 2mm}
.ord .place{margin-bottom:2mm}
.row2{margin-bottom:1.6mm}
.blank.xl{min-width:140mm}.blank.xl2{min-width:125mm}.blank.full{width:100%}
.ck{margin:0 1.5mm;font-family:"DejaVu Sans",sans-serif;font-size:9pt}
.ord .sig{gap:6mm;margin-top:3mm}
.ord .sig .ln{height:6mm}
.mpo{position:absolute;left:50mm;bottom:9mm;width:22mm;height:22mm;border:0.3mm dashed #999;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:"DejaVu Sans",sans-serif;font-size:7pt;color:#999}
</style>'''

def write(name, text):
    path = os.path.join(HERE, name)
    if not os.path.exists(path) or open(path, encoding='utf-8').read() != text:
        open(path, 'w', encoding='utf-8').write(text)


for name, title, pages in [
    ('ustav.html', 'Устав ФСИН', [ustav_p1, ustav_p2]),
    ('kodeks.html', 'Кодекс ФСИН', [kodeks_p1, kodeks_p2]),
    ('protsess.html', 'Процессуальный кодекс ФСИН', [proc_p1, proc_p2]),
    ('slovar.html', 'Словарь ФСИН', [slovar_p1, slovar_p2]),
]:
    write(name, doc(title, pages))

o = doc('Ордер на задержание', ['']).replace('<div class="page"></div>', f'<div class="page two">{order_one}{order_one}</div>')
o = o.replace('</head>', order_css + '</head>')
write('order.html', o)


# ───────────────────────── ПАТЕНТ ВЕРХОВНОГО СУДЬИ ─────────────────────────
def blank(v, cls=''):
    return f'<b class="fill">{v}</b>' if v else f'<span class="blank {cls}"></span>'


def patent(fam='', io='', rank='', no=''):
    fio = f'{fam} {io}'.strip()
    return head(f'ПАТЕНТ<br>№ {no or "ВС-____"}') + f'''
 <h1 class="big" style="margin-top:9mm">ПАТЕНТ</h1>
 <div class="h1sub">на право осуществления правосудия</div>
 <p class="pt-lead">Приказом Лидера ФСИН</p>
 <p class="pt-name">{blank(fio, 'xl')}</p>
 <p class="pt-rank">{blank(rank)}</p>
 <p class="pt-lead">назначается на должность</p>
 <div class="pt-title">ВЕРХОВНЫЙ СУДЬЯ ФСИН</div>
''' + '<h2>Полномочия Верховного судьи</h2>' + ol('1', [
        'Проводить заседания Суда ФСИН в <b>Зале суда — раздевалке</b>.',
        'Рассматривать дела по КоАП и УК ФСИН, выносить обвинительные и оправдательные решения.',
        'Рассматривать жалобы на решения других судей ФСИН.',
        'Назначать судей, секретаря и пристава заседания.',
        'Удалять из Зала суда нарушителей порядка.',
        'Давать официальное толкование Кодекса ФСИН.',
    ]) + '<h2>Правила Зала суда</h2>' + ol('2', [
        'Заседания проводятся на перемене или после уроков.',
        'Участие обвиняемого добровольное: он может сказать «стоп» и уйти, дело продолжится заочно. Двери не запираются.',
        'Верховный судья не рассматривает дела, в которых сам выступает адвокатом или стороной.',
        'Решение Верховного судьи окончательное; помиловать осуждённого может только Лидер ФСИН.',
    ]) + '''
 <p class="pt-term">Срок полномочий: до 31 мая 20___ г.</p>
 <div class="mp" style="left:auto;right:22mm;bottom:18mm">М.П.</div>'''


patent_css = '''<style>
.pt-lead{text-align:center;font-size:10pt;font-style:italic;color:#444;margin:2mm 0 1mm}
.pt-name{text-align:center;font-size:15pt;margin:1mm 0}
.pt-rank{text-align:center;font-size:11pt;margin:0 0 2mm}
.fill{font-weight:bold;letter-spacing:.5pt}
.blank.xl{min-width:120mm}
.pt-title{text-align:center;font-size:17pt;font-weight:bold;letter-spacing:4pt;border-top:0.5mm solid #15161b;border-bottom:0.5mm solid #15161b;padding:2mm 0;margin:3mm 18mm 4mm}
.pt-term{font-size:9.6pt;margin-top:3mm}
</style>'''


def patent_doc(**kw):
    return doc('Патент Верховного судьи', [patent(**kw)]).replace('</head>', patent_css + '</head>')


write('sudya.html', patent_doc())

# ───────────────────────── ДАННЫЕ ИЗ people.js (только для out/) ─────────────────────────
PEOPLE = []
pj = os.path.join(HERE, 'people.js')
if os.path.exists(pj):
    import json, subprocess
    PEOPLE = json.loads(subprocess.run(
        ['node', '-e', 'global.window={};eval(require("fs").readFileSync(process.argv[1],"utf8"));'
                       'console.log(JSON.stringify(window.PEOPLE))', pj],
        capture_output=True, text=True, check=True).stdout)
    os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
STAFF = [p for p in PEOPLE if p.get('kind', 'std') == 'std' and not p.get('blank')]
lst = lambda x: x if isinstance(x, list) else ([x] if x else [])


def write_out(name, html):
    write(os.path.join('out', name), html.replace('href="doc.css"', 'href="../doc.css"'))


# именные патенты (judge: true)
for p in PEOPLE:
    if p.get('judge'):
        write_out(f"sudya-{p['sn']}.html", patent_doc(fam=p['fam'], io=p['io'], rank=p.get('judgeRank', p['rank']), no=f"ВС-{p['sn']}"))


def styled(title, pages, css='', cls=''):
    h = doc(title, pages)
    if cls:
        h = h.replace('<div class="page">', f'<div class="page {cls}">')
    return h.replace('</head>', f'<style>{css}</style></head>') if css else h


def field(label, cls=''):
    return f'<p class="row2">{label} <span class="blank {cls}"></span></p>'


def sig2(a, b):
    return f'''<div class="sig"><div class="col"><b>{a[0]}</b><small>{a[1]}</small><div class="ln"></div><small>подпись / ФИО</small></div>
  <div class="col"><b>{b[0]}</b><small>{b[1]}</small><div class="ln"></div><small>подпись / ФИО</small></div></div>'''


FORM_CSS = '''
.row2{margin-bottom:2.2mm;font-size:10pt}
.blank.xl{min-width:130mm}.blank.full{display:block;width:100%;height:6mm;margin-top:1mm}
.lines span{display:block;border-bottom:0.25mm solid #15161b;height:7mm}
.ck{margin:0 2mm 0 0;font-family:"DejaVu Sans",sans-serif;font-size:9.5pt}
table.t{width:100%;border-collapse:collapse;margin-top:2mm;font-size:9pt}
table.t th,table.t td{border:0.25mm solid #15161b;padding:1.6mm 2mm;text-align:left;vertical-align:top}
table.t th{background:#eceef2;font-family:"DejaVu Sans",sans-serif;font-size:7.5pt;letter-spacing:.6pt;text-transform:uppercase}
table.t td{height:7.5mm}
'''

# ── 4. ПОВЕСТКА (4 на лист)
pov_one = '''<div class="q">
 <div class="qh"><svg><use href="#emb"/></svg><div><b>ФСИН</b><small>''' + ORG + '''</small></div><span>№ ____</span></div>
 <h3>ПОВЕСТКА</h3>
 <p>Гр. <span class="blank w"></span></p>
 <p>Класс <span class="blank s"></span></p>
 <p>Вы вызываетесь в <b>Зал суда ФСИН</b> в качестве:</p>
 <p class="cks"><span>☐ обвиняемого</span><span>☐ свидетеля</span><span>☐ потерпевшего</span></p>
 <p>Дело № <span class="blank s"></span> статья <span class="blank s"></span></p>
 <p>Дата <span class="blank s"></span> перемена № <span class="blank xs"></span></p>
 <p class="sm">Явка добровольная. При неявке дело рассматривается заочно. Вы вправе прийти с адвокатом.</p>
 <div class="qs"><span>Судья ФСИН</span><span class="ln"></span></div>
</div>'''
POV_CSS = FORM_CSS + '''
.page.grid{padding:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
.page.grid::before,.page.grid::after{display:none}
.q{padding:11mm 11mm 9mm;position:relative;border-right:0.3mm dashed #999;border-bottom:0.3mm dashed #999}
.q::before{content:"";position:absolute;inset:4mm;border:0.4mm solid #15161b}
.qh{display:flex;align-items:center;gap:2.5mm;border-bottom:0.4mm solid #15161b;padding-bottom:2mm}
.qh svg{width:13mm;height:13mm}
.qh b{display:block;font-size:16pt;letter-spacing:3pt}
.qh small{display:block;font-family:"DejaVu Sans",sans-serif;font-size:5.2pt;letter-spacing:.8pt;color:#555}
.qh span{margin-left:auto;font-family:"DejaVu Sans Mono",monospace;font-size:8pt}
.q h3{text-align:center;font-size:20pt;letter-spacing:5pt;margin:7mm 0 6mm}
.q p{font-size:10.5pt;margin-bottom:4.2mm}
.q .blank.w{min-width:60mm}.q .blank.s{min-width:18mm}.q .blank.xs{min-width:10mm}
.cks{display:flex;gap:2.5mm;font-family:"DejaVu Sans",sans-serif;font-size:8.4pt}
.cks span{white-space:nowrap}
.q .sm{font-size:8.2pt;color:#444;font-style:italic;line-height:1.35}
.qs{display:flex;align-items:flex-end;gap:2mm;font-size:9.5pt;margin-top:9mm}
.qs .ln{flex:1;border-bottom:0.25mm solid #15161b;height:6mm}
'''
write('povestka.html', doc('Повестка', ['']).replace('<div class="page"></div>', f'<div class="page grid">{pov_one * 4}</div>').replace('</head>', f'<style>{POV_CSS}</style></head>'))

# ── 5. ЖАЛОБА / АПЕЛЛЯЦИЯ
zhaloba = head('ЖАЛОБА<br>вх. № ____') + '''
 <p style="text-align:right;margin-top:6mm;font-size:10pt">Лидеру ФСИН<br>от <span class="blank" style="min-width:60mm"></span><br>класс <span class="blank s"></span></p>
 <h1 class="big">ЖАЛОБА</h1><div class="h1sub">(апелляция) на решение Суда ФСИН</div>
''' + field('Дело №', 's') + field('Дата решения', '') + field('Судья', 'xl') + field('Статья Кодекса ФСИН', 's') + field('Назначенное взыскание', 'xl') + '''
 <p class="row2"><b>Почему решение несправедливо:</b></p>
 <div class="lines">''' + '<span></span>' * 7 + '''</div>
 <p class="row2" style="margin-top:3mm"><b>Прошу:</b></p>
 <p class="cks" style="display:block"><span class="ck">☐ отменить решение и оправдать</span><br><span class="ck">☐ смягчить взыскание</span><br><span class="ck">☐ пересмотреть дело другим судьёй</span></p>
 <p class="row2" style="margin-top:2mm">Свидетели / доказательства <span class="blank xl"></span></p>
 <p class="sm" style="font-size:8.5pt;color:#444;font-style:italic">Жалоба подаётся в течение 3 дней после решения. Решение Лидера окончательное.</p>
''' + sig2(('Заявитель', 'подаёт жалобу'), ('Адвокат', 'Коллегия адвокатов (если есть)')) + '''
 <div class="box" style="margin-top:4mm"><p><b>Решение Лидера:</b> ☐ отменить &nbsp; ☐ смягчить до <span class="blank"></span> &nbsp; ☐ оставить в силе &nbsp;&nbsp; Подпись <span class="blank s"></span></p></div>'''
write('zhaloba.html', styled('Жалоба', [zhaloba], FORM_CSS))

# ── 6. ХОДАТАЙСТВО О ПОМИЛОВАНИИ
pomil = head('ХОДАТАЙСТВО<br>вх. № ____') + '''
 <p style="text-align:right;margin-top:6mm;font-size:10pt">Лидеру ФСИН<br>от <span class="blank" style="min-width:60mm"></span></p>
 <h1 class="big">ХОДАТАЙСТВО</h1><div class="h1sub">о помиловании</div>
''' + field('Осуждённый (ФИО)', 'xl') + field('Класс', 's') + field('Дело №', 's') + field('Статья', 's') + field('Взыскание / срок', 'xl') + field('Отбыто', '') + '''
 <p class="row2"><b>Основания для помилования:</b></p>
 <p class="cks" style="display:block;font-size:9.5pt;line-height:1.7"><span class="ck">☐ раскаялся и извинился перед потерпевшим</span><br><span class="ck">☐ помирился с потерпевшим</span><br><span class="ck">☐ первое нарушение</span><br><span class="ck">☐ помог ФСИН / проявил себя</span><br><span class="ck">☐ другое:</span> <span class="blank" style="min-width:110mm"></span></p>
 <p class="row2" style="margin-top:2mm"><b>Пояснение:</b></p>
 <div class="lines">''' + '<span></span>' * 5 + '''</div>
 <p class="row2" style="margin-top:3mm">Ходатайство подаёт: <span class="ck">☐ осуждённый</span><span class="ck">☐ адвокат</span><span class="ck">☐ потерпевший</span></p>
''' + sig2(('Заявитель', 'подаёт ходатайство'), ('Адвокат', 'Коллегия адвокатов')) + '''
 <div class="box" style="margin-top:4mm"><p><b>Решение Лидера:</b> ☐ помиловать полностью &nbsp; ☐ сократить срок до <span class="blank s"></span> &nbsp; ☐ отказать &nbsp;&nbsp; Подпись <span class="blank s"></span></p></div>'''
write('pomilovanie.html', styled('Ходатайство о помиловании', [pomil], FORM_CSS))

# ── 8. КАРТОЧКА «МИРАНДА» (10 на лист)
mir_one = '''<div class="mc"><div class="mh"><svg><use href="#emb"/></svg><b>ФСИН</b><span>ПРАВА ЗАДЕРЖАННОГО</span></div>
 <ol><li>Вы можете сказать <b>«СТОП»</b> в любой момент и уйти.</li><li>Вы имеете право молчать.</li><li>Вы имеете право на <b>адвоката</b>.</li><li>Двери не запираются, силу не применяют.</li><li>Со звонком на урок вы свободны.</li></ol>
 <p>«Вам понятны ваши права?»</p></div>'''
MIR_CSS = '''
.page.cards{padding:12mm 15mm;display:grid;grid-template-columns:85mm 85mm;grid-auto-rows:54mm;gap:0;justify-content:center;align-content:center}
.page.cards::before,.page.cards::after{display:none}
.mc{border:0.3mm dashed #999;padding:3.5mm 4.5mm;position:relative}
.mc::before{content:"";position:absolute;inset:1.6mm;border:0.35mm solid #15161b}
.mh{display:flex;align-items:center;gap:2mm;border-bottom:0.3mm solid #15161b;padding-bottom:1.3mm;margin-bottom:1.5mm}
.mh svg{width:7mm;height:7mm}.mh b{font-size:11pt;letter-spacing:2pt}
.mh span{margin-left:auto;font-family:"DejaVu Sans",sans-serif;font-size:6.2pt;letter-spacing:.8pt;font-weight:bold}
.mc ol li{font-size:7.6pt;line-height:1.35;padding-left:5mm;margin-bottom:.2mm}
.mc ol li::before{content:counter(i) ".";font-weight:bold}
.mc p{font-size:7.6pt;font-style:italic;text-align:center;margin-top:1mm}
'''
write('miranda.html', doc('Миранда ФСИН', ['']).replace('<div class="page"></div>', f'<div class="page cards">{mir_one * 10}</div>').replace('</head>', f'<style>{MIR_CSS}</style></head>'))

# ── 10. ТАБЕЛЬ ДЕЖУРСТВ ПРИСТАВОВ
days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница']
rows = ''.join(f'<tr><th style="width:18mm">{i}</th>' + '<td></td>' * 5 + '</tr>' for i in range(1, 8))
dezh = head('ТАБЕЛЬ<br>Служба приставов') + '''
 <h1 class="big" style="margin-top:6mm">ТАБЕЛЬ ДЕЖУРСТВ</h1><div class="h1sub">Службы приставов ФСИН</div>
 <p class="row2">Неделя: с <span class="blank s"></span> по <span class="blank s"></span> &nbsp;&nbsp; Старший пристав <span class="blank"></span></p>
 <p class="sm" style="font-size:8.5pt;color:#444">В клетке: фамилия пристава и пост — <b>К</b> (КПЗ), <b>Т</b> (тюрьма), <b>З</b> (Зал суда), <b>Д</b> (допросная).</p>
 <table class="t dz"><tr><th>Перемена</th>''' + ''.join(f'<th>{d}</th>' for d in days) + '</tr>' + rows + '''</table>
 <h2>Правила дежурства</h2>''' + ol('Д', [
    'Пристав приходит на пост в начале перемены и уходит со звонком.',
    'Задержанного освобождают по слову «стоп», по окончании срока или со звонком на урок.',
    'Не пришёл на дежурство — найди замену и предупреди старшего пристава.',
    'Все происшествия записываются в Журнал ФСИН.',
]) + '<div class="sig"><div class="col"><b>Утверждаю</b><small>Старший пристав</small><div class="ln"></div><small>подпись</small></div><div class="col"></div></div>'
write('dezhurstva.html', styled('Табель дежурств', [dezh], FORM_CSS + 'table.dz td{height:15mm}'))

# ── 14. АНКЕТА КАНДИДАТА
anketa = head('АНКЕТА<br>№ ____') + '''
 <h1 class="big" style="margin-top:6mm">АНКЕТА КАНДИДАТА</h1><div class="h1sub">на вступление в ряды ФСИН</div>
 <div style="display:flex;gap:6mm"><div style="flex:1">''' + field('Фамилия', 'xl2') + field('Имя', 'xl2') + field('Отчество', 'xl2') + field('Класс', 's') + field('Дата рождения', '') + field('Telegram / телефон', '') + '''</div>
  <div class="ph">ФОТО<br>3×4<br><small>лицом прямо,<br>светлый фон</small></div></div>
''' + field('Желаемое звание', 'xl') + field('Желаемая должность', 'xl') + field('Отдел(ы)', 'xl') + field('Желаемый номер удостоверения (100–999)', 's') + '''
 <p class="row2"><b>Почему хочу вступить в ФСИН:</b></p><div class="lines">''' + '<span></span>' * 3 + '''</div>
 <p class="row2" style="margin-top:3mm"><b>Чем могу быть полезен:</b></p><div class="lines">''' + '<span></span>' * 2 + '''</div>
 <p class="row2" style="margin-top:3mm">Кто рекомендует (сотрудник ФСИН) <span class="blank"></span></p>
 <p class="row2"><span class="ck">☐</span> С Уставом и Кодексом ФСИН ознакомлен, правила задержания (согласие, «стоп») понимаю</p>
''' + sig2(('Кандидат', 'заполнил'), ('Отдел кадров', 'принял')) + '''
 <div class="box" style="margin-top:3mm"><p><b>Решение:</b> ☐ принят, звание <span class="blank"></span> № удост. <span class="blank s"></span> &nbsp; ☐ стажёр &nbsp; ☐ отказ</p></div>'''
write('anketa.html', styled('Анкета кандидата', [anketa], FORM_CSS + '''
.blank.xl2{min-width:95mm}
.ph{width:30mm;height:40mm;border:0.3mm dashed #15161b;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:"DejaVu Sans",sans-serif;font-size:9pt;color:#777;flex:none}
.ph small{font-size:6.5pt;margin-top:1mm}'''))


# ── 15. ЛИЧНОЕ ДЕЛО
def delo(p=None, photo=''):
    p = p or {}
    v = lambda x: f'<b class="fill">{x}</b>' if x else '<span class="blank xl2"></span>'
    ph = f'<div class="ph" style="background:url(\'{photo}\') {p.get("photoPos", "50% 35%")}/{p.get("photoZoom", "130%")} no-repeat;border-style:solid"></div>' if photo else '<div class="ph">ФОТО<br>3×4</div>'
    pw = ''.join(f'<li>{x}</li>' for x in p.get('powers', [])) or '<li>&nbsp;</li><li>&nbsp;</li><li>&nbsp;</li>'
    hist = ''.join('<tr><td></td><td></td><td></td></tr>' for _ in range(4))
    pv = ''.join('<tr><td></td><td></td><td></td><td></td></tr>' for _ in range(5))
    return head(f'ЛИЧНОЕ ДЕЛО<br>№ {p.get("sn", "____")}') + f'''
 <h1 class="big" style="margin-top:5mm">ЛИЧНОЕ ДЕЛО</h1><div class="h1sub">сотрудника ФСИН</div>
 <div style="display:flex;gap:6mm"><div style="flex:1">
  <p class="row2">Фамилия {v(p.get("fam"))}</p><p class="row2">Имя, отчество {v(p.get("io"))}</p>
  <p class="row2">Звание {v(p.get("rank"))}</p><p class="row2">Удостоверение № {v(p.get("sn"))}</p>
  <p class="row2">Должность {v(", ".join(lst(p.get("pos"))))}</p><p class="row2">Отдел(ы) {v(", ".join(lst(p.get("dep"))))}</p>
  <p class="row2">Дата вступления <span class="blank"></span> &nbsp; Класс <span class="blank s"></span></p>
 </div>{ph}</div>
 <h2>Полномочия</h2><ol style="--s:'П'">{pw}</ol>
 <h2>История званий и должностей</h2>
 <table class="t"><tr><th style="width:28mm">Дата</th><th>Звание / должность</th><th style="width:40mm">Приказ</th></tr>{hist}</table>
 <h2>Поощрения и взыскания</h2>
 <table class="t"><tr><th style="width:28mm">Дата</th><th style="width:30mm">Тип</th><th>За что</th><th style="width:30mm">Статья / №</th></tr>{pv}</table>
 <div class="sig" style="margin-top:4mm"><div class="col"><b>Отдел кадров</b><small>ведёт дело</small><div class="ln"></div><small>подпись</small></div><div class="col"></div></div>'''


DELO_CSS = FORM_CSS + '''.blank.xl2{min-width:80mm}
.ph{width:30mm;height:40mm;border:0.3mm dashed #15161b;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:"DejaVu Sans",sans-serif;font-size:9pt;color:#777;flex:none}
.fill{font-weight:bold}'''
write('delo.html', styled('Личное дело', [delo()], DELO_CSS))
for p in STAFF:
    write_out(f"delo-{p['sn']}.html", styled('Личное дело', [delo(p, '../' + p['photo'] if p.get('photo') else '')], DELO_CSS))


# ── 16. РЕЕСТР СОТРУДНИКОВ
def reestr(people):
    rows = ''.join(f'<tr><td>{i}</td><td><b>{p["sn"]}</b></td><td>{p["fam"]} {p["io"]}</td><td>{p["rank"]}</td><td>{", ".join(lst(p.get("dep")))}</td><td></td></tr>'
                   for i, p in enumerate(people, 1))
    rows += ''.join(f'<tr><td>{i}</td><td></td><td></td><td></td><td></td><td></td></tr>' for i in range(len(people) + 1, 23))
    return head('РЕЕСТР<br>Отдел кадров') + f'''
 <h1 class="big" style="margin-top:5mm">РЕЕСТР СОТРУДНИКОВ</h1><div class="h1sub">Филиповской службы исполнения наказаний</div>
 <table class="t rs"><tr><th style="width:8mm">№</th><th style="width:20mm">Удост.</th><th>ФИО</th><th style="width:36mm">Звание</th><th style="width:42mm">Отдел</th><th style="width:16mm">Отм.</th></tr>{rows}</table>
 <p class="sm" style="font-size:8pt;color:#555;margin-top:2mm">Отм.: С — стажёр, У — уволен, И — исключён, В — ветеран. Реестр ведёт Отдел кадров.</p>'''


RS_CSS = FORM_CSS + 'table.rs td{height:8mm;font-size:8.6pt}'
write('reestr.html', styled('Реестр сотрудников', [reestr([])], RS_CSS))
if STAFF:
    write_out('reestr.html', styled('Реестр сотрудников', [reestr(sorted(STAFF, key=lambda p: str(p['sn'])))], RS_CSS))


# ── 17. СТРУКТУРА ФСИН
def leader_of(key):
    names = [f'{p["fam"]} {p["io"].split()[0][0]}.' for p in STAFF if any(key in x for x in lst(p.get('pos')))]
    return ', '.join(names)


def struktura(named):
    nm = (lambda k: leader_of(k)) if named else (lambda k: '')
    judge = next((f'{p["fam"]} {p["io"].split()[0][0]}.' for p in PEOPLE if p.get('judge')), '') if named else ''
    box = lambda t, s='', who='': f'<div class="sb"><b>{t}</b>{f"<small>{s}</small>" if s else ""}<i>{who or "&nbsp;"}</i></div>'
    depts = [('Отдел задержания', 'задержания, допросы, обвинение', 'Лидер отдела задержания'),
             ('Отдел кадров', 'реестр, звания, удостоверения', 'Лидер отдела кадров'),
             ('Коллегия адвокатов', 'защита задержанных', 'Лидер коллегии адвокатов'),
             ('Спецвойска', 'охрана, особые операции', 'Лидер спецвойск'),
             ('Танковые войска', 'операции, экипажи', 'Лидер танковых войск'),
             ('Воздушные войска', 'разведка, поддержка', 'Лидер воздушных войск'),
             ('Отдел помощи', 'помощь пострадавшим', 'Лидер отдела помощи'),
             ('Служба приставов', 'посты, Зал суда', 'Старший пристав')]
    return head('СТРУКТУРА<br>ФСИН') + f'''
 <h1 class="big" style="margin-top:5mm">СТРУКТУРА ФСИН</h1><div class="h1sub">Филиповской службы исполнения наказаний</div>
 <div class="st">
  <div class="lv">{box('ЛИДЕР ФСИН', 'высшее должностное лицо')}</div>
  <div class="vl"></div>
  <div class="lv two">{box('СОВЕТ ГЕНЕРАЛОВ', 'все генералы · Устав, генеральские звания')}{box('ВЕРХОВНЫЙ СУД', 'Зал суда — раздевалка', judge)}</div>
  <div class="vl"></div>
  <div class="hl"></div>
  <div class="lv grid">{''.join(box(t, s, nm(k)) for t, s, k in depts)}</div>
 </div>
 <h2>Места</h2>{ol('М', ['<b>Тюрьма</b> — кабинки туалета · <b>КПЗ</b> — туалет · <b>Допросная</b> и <b>Зал суда</b> — раздевалка.'])}'''


ST_CSS = '''
.st{margin-top:12mm;text-align:center}
.lv{display:flex;justify-content:center;gap:8mm}
.lv.two .sb{width:70mm}
.lv.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:5mm}
.sb{border:0.45mm solid #15161b;padding:3.5mm 3mm;min-width:66mm;background:#fff}
.lv.grid .sb{min-width:0}
.sb b{display:block;font-size:11.5pt;letter-spacing:1pt}
.sb small{display:block;font-family:"DejaVu Sans",sans-serif;font-size:7.6pt;color:#555;margin-top:.8mm}
.sb i{display:block;font-style:normal;font-weight:bold;font-size:10pt;margin-top:1.5mm;border-top:0.2mm dashed #999;padding-top:1.2mm;min-height:4mm}
.vl{width:0.45mm;height:9mm;background:#15161b;margin:0 auto}
.hl{height:0.45mm;background:#15161b;margin:0 10% 4mm}
'''
write('struktura.html', styled('Структура ФСИН', [struktura(False)], ST_CSS))
if STAFF:
    write_out('struktura.html', styled('Структура ФСИН', [struktura(True)], ST_CSS))

# ── 25. ОБЪЯВЛЕНИЕ О НАБОРЕ (плакат)
nabor = '''<svg class="wm"><use href="#embL"/></svg>
 <div class="pz">
  <svg class="pe"><use href="#emb"/></svg>
  <div class="pf">ФСИН</div><div class="pn">''' + ORG + '''</div>
  <div class="pt">ОБЪЯВЛЯЕТ НАБОР</div>
  <div class="pq">Хочешь порядок, честь и своих за спиной?</div>
  <div class="pg">
   <div><b>16</b><span>званий — от рядового до генерал-полковника</span></div>
   <div><b>8</b><span>отделов и служб на выбор</span></div>
   <div><b>1</b><span>личное удостоверение с фото и номером</span></div>
  </div>
  <div class="pl"><b>Требуются:</b> сотрудники отдела задержания · адвокаты · приставы · спецвойска · танковые и воздушные войска · отдел помощи</div>
  <div class="pl"><b>Как вступить:</b> заполни анкету → подпиши договор → прими присягу → получи корочку</div>
  <div class="pm">ЧЕСТЬ · ПОРЯДОК · ВЕРНОСТЬ СВОИМ</div>
  <div class="pc">Обращайся к любому сотруднику ФСИН</div>
 </div>'''
NB_CSS = '''
.pz{text-align:center;padding-top:6mm}
.pe{width:42mm;height:42mm}
.pf{font-size:62pt;font-weight:bold;letter-spacing:14pt;margin-left:14pt;line-height:1.05}
.pn{font-family:"DejaVu Sans",sans-serif;font-size:9pt;letter-spacing:2.5pt;color:#444}
.pt{font-size:30pt;font-weight:bold;letter-spacing:5pt;margin:9mm 0 3mm;border-top:0.8mm solid #15161b;border-bottom:0.8mm solid #15161b;padding:3mm 0}
.pq{font-size:15pt;font-style:italic;margin-bottom:8mm}
.pg{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm;margin:0 6mm 8mm}
.pg div{border:0.4mm solid #15161b;padding:4mm 2mm}
.pg b{display:block;font-size:30pt}
.pg span{font-size:9.5pt;line-height:1.35;display:block}
.pl{font-size:11pt;line-height:1.5;margin:0 8mm 4mm}
.pm{font-size:13pt;letter-spacing:4pt;margin-top:9mm;font-weight:bold}
.pc{font-family:"DejaVu Sans",sans-serif;font-size:10pt;margin-top:3mm;color:#444}
'''
write('nabor.html', styled('Набор в ФСИН', [nabor], NB_CSS))

# ── 26. РАЗЫСКИВАЕТСЯ (плакат, только с согласия)
rozysk = '''<svg class="wm"><use href="#embL"/></svg>
 <div class="head"><svg><use href="#emb"/></svg><div class="t"><div class="org">ФСИН</div><div class="sub">''' + ORG + '''</div></div><div class="no">ОРИЕНТИРОВКА<br>№ ____</div></div>
 <div class="rz">РАЗЫСКИВАЕТСЯ</div>
 <div class="rp">ФОТО</div>
 <div class="rf">
''' + field('ФИО / прозвище', 'xl') + field('Класс', 's') + field('Приметы', 'xl') + field('Разыскивается по статье', 's') + field('Суть', 'xl') + field('Последний раз видели', 'xl') + '''
 </div>
 <div class="rr">НАГРАДА: <span class="blank" style="min-width:90mm"></span></div>
 <p class="rn">Увидел — сообщи любому сотруднику ФСИН.</p>
 <p class="rs2">Ориентировка размещена с согласия разыскиваемого: <span class="blank s"></span></p>'''
RZ_CSS = FORM_CSS + '''
.rz{text-align:center;font-size:36pt;font-weight:bold;letter-spacing:4pt;margin:7mm 0 5mm;border-top:1mm solid #15161b;border-bottom:1mm solid #15161b;padding:2mm 0}
.rp{width:85mm;height:100mm;border:0.6mm solid #15161b;margin:0 auto 6mm;display:flex;align-items:center;justify-content:center;font-family:"DejaVu Sans",sans-serif;color:#999;font-size:14pt}
.rf{margin:0 4mm}
.rr{text-align:center;font-size:16pt;font-weight:bold;margin-top:5mm}
.rn{text-align:center;font-size:11pt;margin-top:3mm}
.rs2{text-align:right;font-family:"DejaVu Sans",sans-serif;font-size:7.5pt;color:#555;margin-top:4mm}
'''
write('rozysk.html', styled('Разыскивается', [rozysk], RZ_CSS))

# ── 30. ШИФР ФСИН
ALPH = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'
cells = list(ALPH) + ['␣', '.', '?']
grid = '<table class="t sq"><tr><th></th>' + ''.join(f'<th>{c}</th>' for c in range(1, 7)) + '</tr>'
for r in range(6):
    grid += f'<tr><th>{r + 1}</th>' + ''.join(f'<td>{cells[r * 6 + c]}</td>' for c in range(6)) + '</tr>'
grid += '</table>'
codes = [('0', 'Всё спокойно'), ('1', 'Сбор'), ('2', 'Операция начата'), ('3', 'Нужен адвокат'), ('4', 'Задержание проведено'),
         ('5', 'Суд на следующей перемене'), ('6', 'Отбой, расходимся'), ('7', 'Нужна помощь'), ('8', 'Задержанный сказал «стоп» — освобождён'), ('9', 'Срочно к Лидеру')]
def enc(s):
    return ' '.join(next(f'{i // 6 + 1}{i % 6 + 1}' for i, c in enumerate(cells) if c == (ch if ch != ' ' else '␣')) for ch in s.upper())
shifr = head('ШИФР<br>секретно') + f'''
 <h1 class="big" style="margin-top:5mm">ШИФР ФСИН</h1><div class="h1sub">для служебных записок сотрудников</div>
 <h2>1. Квадрат ФСИН</h2>
 <p style="font-size:9.5pt">Каждая буква — две цифры: <b>строка</b>, потом <b>столбец</b>. Буквы разделяются пробелом.</p>
 <div style="display:flex;gap:8mm;align-items:flex-start"><div style="flex:none">{grid}</div>
  <div class="ex"><p><b>Пример:</b></p><p>ФСИН → <code>{enc("ФСИН")}</code></p><p>СБОР → <code>{enc("СБОР")}</code></p>
  <p><b>Расшифруй сам:</b></p><p><code>{enc("ЧЕСТЬ")}</code></p></div></div>
 <h2>2. Коды ФСИН</h2>
 <p style="font-size:9.5pt">Короткий сигнал в чате или на записке: «<b>ФСИН-</b>» и цифра.</p>
 <table class="t cd"><tr><th style="width:24mm">Код</th><th>Значение</th><th style="width:24mm">Код</th><th>Значение</th></tr>''' + ''.join(
    f'<tr><td><b>ФСИН-{codes[i][0]}</b></td><td>{codes[i][1]}</td><td><b>ФСИН-{codes[i + 5][0]}</b></td><td>{codes[i + 5][1]}</td></tr>' for i in range(5)) + '''</table>
 <div class="box" style="margin-top:4mm"><p><b>Правило:</b> шифр — для своих. Таблицу не показывать посторонним, после прочтения записку выбросить.</p></div>'''
SH_CSS = FORM_CSS + '''
table.sq{width:auto}
table.sq th,table.sq td{width:11mm;height:9mm;text-align:center;vertical-align:middle;font-size:12pt;padding:0}
table.sq td{font-weight:bold}
.ex p{font-size:10pt;margin-bottom:2.5mm}
code{font-family:"DejaVu Sans Mono",monospace;font-size:10pt;background:#eceef2;padding:.5mm 1.5mm}
table.cd td{height:auto;font-size:9.5pt}
'''
write('shifr.html', styled('Шифр ФСИН', [shifr], SH_CSS))
print('ok')
