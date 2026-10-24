"""Real AI05/AI06 SQL checks in a fresh, loopback-only disposable PostgreSQL cluster.

Opt in with MOFLIGHT_TEST_POSTGRES_BIN pointing to a local PostgreSQL bin directory.
No external database URL, credentials, existing cluster, service or model is used.
Artifacts remain under ignored build/ai-postgres/ for diagnosis; server always stops.
"""
import atexit
import ctypes
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import socket
import subprocess
import unittest
import uuid
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/migrations/202610240001_ai_policy_ledger.sql'


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def base_policy(**changes):
    value = dict(version=1, id='p1', enabled=True, model='openai/gpt-6-luna', reasoning='max', zdrOnly=True,
                 store=False, automaticRetries=0, routes=['azure'], features=['question', 'review', 'progress', 'term'],
                 tools=['describeDataset', 'aggregateFlights'], systemPrompt='Synthetic pinned prompt.', personalCapMicroEur=1000000,
                 globalCapMicroEur=1000000, questionCapMicroEur=50000, reviewCapMicroEur=100000,
                 inputTokens=32000, outputTokens=16384, questionTurns=6, reviewTurns=16, questionTools=12, reviewTools=48, rowsPerRead=200)
    return value | changes


@unittest.skipUnless(os.getenv('MOFLIGHT_TEST_POSTGRES_BIN'), 'Opt-in local PostgreSQL runtime not selected')
class AiPostgres(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bin = Path(os.environ['MOFLIGHT_TEST_POSTGRES_BIN']).resolve()
        cls.exe = '.exe' if os.name == 'nt' else ''
        cls.env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
        cls.env['PGCONNECT_TIMEOUT'] = '5'
        cls.flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        cls.dll_dir = os.add_dll_directory(str(cls.bin)) if os.name == 'nt' else None
        cls.pq = ctypes.CDLL(str(cls.bin / ('libpq.dll' if os.name == 'nt' else 'libpq.so')))
        for name, args, result in [('PQconnectdb',[ctypes.c_char_p],ctypes.c_void_p),
            ('PQstatus',[ctypes.c_void_p],ctypes.c_int),('PQerrorMessage',[ctypes.c_void_p],ctypes.c_char_p),
            ('PQexec',[ctypes.c_void_p,ctypes.c_char_p],ctypes.c_void_p),('PQresultStatus',[ctypes.c_void_p],ctypes.c_int),
            ('PQresultErrorMessage',[ctypes.c_void_p],ctypes.c_char_p),('PQntuples',[ctypes.c_void_p],ctypes.c_int),
            ('PQnfields',[ctypes.c_void_p],ctypes.c_int),('PQgetvalue',[ctypes.c_void_p,ctypes.c_int,ctypes.c_int],ctypes.c_char_p),
            ('PQclear',[ctypes.c_void_p],None),('PQfinish',[ctypes.c_void_p],None)]:
            fn=getattr(cls.pq,name);fn.argtypes=args;fn.restype=result
        parent = (ROOT / 'build/ai-postgres').resolve()
        parent.mkdir(parents=True, exist_ok=True)
        cls.output = parent / uuid.uuid4().hex
        cls.output.mkdir(exist_ok=False)
        cls.data = cls.output / 'cluster'
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            cls.port = str(listener.getsockname()[1])
        cls.started = False
        atexit.register(cls.stop)
        try:
            cls.command('initdb', '-D', str(cls.data), '-U', 'postgres', '--auth-host=trust', '--auth-local=trust', '--encoding=UTF8', '--locale=C')
            cls.started = True  # Cleanup also covers a failed/partial startup.
            cls.command('pg_ctl', 'start', '-D', str(cls.data), '-l', str(cls.output / 'server.log'),
                        '-o', f'-h 127.0.0.1 -p {cls.port}', '-w', '-t', '30')
            cls.started = True
            roles = cls.sql('create role anon; create role authenticated; create role service_role bypassrls;', database='postgres')
            if roles.returncode: raise RuntimeError(roles.stderr)
            cls.version = cls.sql('select version()', database='postgres').stdout.strip()
        except BaseException:
            cls.stop()
            raise

    @classmethod
    def command(cls, name, *args):
        # On Windows postgres inherits pg_ctl handles; PIPE would wait on the server.
        with (cls.output / 'commands.log').open('a', encoding='utf-8') as log:
            result = subprocess.run([str(cls.bin / (name + cls.exe)), *args], stdout=log, stderr=log,
                                    env=cls.env, creationflags=cls.flags, timeout=45)
        if result.returncode:
            raise RuntimeError(name + ' failed; see commands.log')
        return result

    @classmethod
    def stop(cls):
        if getattr(cls, 'started', False):
            cls.command('pg_ctl', 'stop', '-D', str(cls.data), '-m', 'fast', '-w', '-t', '15')
            cls.started = False

    @classmethod
    def tearDownClass(cls):
        cls.stop()
        (cls.output / 'environment.json').write_text(json.dumps(dict(version=cls.version, loopback=True, stopped=True,
            boundary='Synthetic local PostgreSQL; no Supabase or model acceptance'), indent=2), encoding='utf-8')
        print('AI PostgreSQL evidence:', cls.output)

    @classmethod
    def sql(cls, text, database=None):
        # libpq is bundled with the runtime; each concurrent call owns its connection.
        conn=cls.pq.PQconnectdb(f"host=127.0.0.1 port={cls.port} user=postgres dbname={database or cls.database} connect_timeout=5 options='-c statement_timeout=10000'".encode())
        result=None
        try:
            if cls.pq.PQstatus(conn): return SimpleNamespace(returncode=1,stdout='',stderr=cls.pq.PQerrorMessage(conn).decode())
            result=cls.pq.PQexec(conn,text.encode('utf-8'))
            if not result: return SimpleNamespace(returncode=1,stdout='',stderr=cls.pq.PQerrorMessage(conn).decode())
            status=cls.pq.PQresultStatus(result)
            output='\n'.join('|'.join(cls.pq.PQgetvalue(result,row,col).decode('utf-8') for col in range(cls.pq.PQnfields(result))) for row in range(cls.pq.PQntuples(result)))
            return SimpleNamespace(returncode=0 if status in (1,2) else 1,stdout=output,stderr=cls.pq.PQresultErrorMessage(result).decode())
        finally:
            if result: cls.pq.PQclear(result)
            cls.pq.PQfinish(conn)

    def ok(self, text):
        result = self.sql(text)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def denied(self, text):
        result = self.sql(text)
        self.assertNotEqual(result.returncode, 0, 'Unexpectedly permitted: ' + text)
        return result.stderr

    def setUp(self):
        type(self).database = 'ai_' + uuid.uuid4().hex
        result = self.sql('create database ' + self.database, database='postgres')
        self.assertEqual(result.returncode, 0, result.stderr)
        for migration in sorted(MIGRATION.parent.glob('*_ai_*.sql')):
            self.ok(migration.read_text(encoding='utf-8'))

    def setup_policy(self, **changes):
        self.policy = base_policy(**changes)
        self.publish(self.policy, 0)
        self.ok("insert into moflight_ai.prices(id,valid_from,valid_until,input_nano_usd,cache_read_nano_usd,cache_write_nano_usd,output_nano_usd,request_nano_usd,gross_micro_eur_per_usd,margin_bps,fees_covered,approved,evidence_ref) "
                "values('synthetic', '2020-01-01T00:00:00Z', '2100-01-01T00:00:00Z',0,0,0,0,40000000,1000000,0,true,true,'synthetic-not-funding')")
        self.ok("select public.moflight_ai_controls(1,false,true,true,'synthetic','synthetic-test')")
        self.account('101')

    def publish(self, policy, epoch):
        return self.ok(f"select public.moflight_ai_publish_policy({quote(json.dumps(policy))}::jsonb,{epoch},'test')")

    def account(self, account):
        self.ok(f"select public.moflight_ai_account({quote(account)},true,true,'synthetic-test')")

    @staticmethod
    def reserve(account='101', attempt='a1', run='r1', round_number=0, policy='p1', digest='a'*64, feature='question'):
        return "select public.moflight_ai_reserve(" + ','.join([quote(account), quote(attempt), quote(run), "'chat1'", "'m1'", quote(feature), str(round_number), quote(policy), quote(digest)]) + ')'

    def settle(self, attempt='a1', run='r1', round_number=0, nano=20000000, receipt='usage-1', account='101'):
        return json.loads(self.ok(f"select public.moflight_ai_settle({quote(account)},{quote(attempt)},{quote(run)},{round_number},{nano},{quote(receipt)})"))

    def test_defaults_and_role_isolation(self):
        self.assertEqual(self.ok('select kill and not operational_ready and not funding_approved from moflight_ai.control'), 't')
        for role in ('anon', 'authenticated', 'service_role'):
            self.denied(f'set role {role}; select * from moflight_ai.control')
            self.denied(f"set role {role}; select public.moflight_ai_publish_policy('{{}}',0,'forged-owner')")
        for role in ('anon', 'authenticated'):
            self.denied(f"set role {role}; select public.moflight_ai_snapshot('101')")
            self.denied(f'set role {role}; ' + self.reserve())
        self.setup_policy()
        self.assertEqual(json.loads(self.ok("set role service_role; create temp table accounts(account_ref text); create temp table control(singleton boolean); create temp table policies(id text); select public.moflight_ai_snapshot('101')"))['policy']['id'],'p1')
        self.assertEqual(json.loads(self.ok('set role service_role; '+self.reserve()))['disposition'],'new')

    def test_policy_validation_cas_rollback_and_immutability(self):
        self.publish(base_policy(), 0)
        self.denied(f"select public.moflight_ai_publish_policy({quote(json.dumps(base_policy(id='bad')))}::jsonb,null,'missing-cas')")
        self.denied("select public.moflight_ai_controls(null,false,true,true,null,'missing-cas')")
        self.denied("select public.moflight_ai_activate_policy('p1',null,'missing-cas')")
        for change in [dict(model=None), dict(reasoning='low'), dict(routes=['other']), dict(systemPrompt='\n\t'),
                       dict(tools=['describeDataset', 'describeDataset']), dict(globalCapMicroEur=1000001), dict(extra='override'), dict(inputTokens=0)]:
            self.denied(f"select public.moflight_ai_publish_policy({quote(json.dumps(base_policy(id='bad',**change)))}::jsonb,1,'invalid')")
            self.assertEqual(self.ok('select policy_id from moflight_ai.control'), 'p1')
        self.denied(f"select public.moflight_ai_publish_policy({quote(json.dumps(base_policy(id='p2')))}::jsonb,0,'stale')")
        self.publish(base_policy(id='p2', systemPrompt='New version'), 1)
        self.ok("select public.moflight_ai_activate_policy('p1',2,'rollback')")
        self.assertEqual(self.ok('select policy_id from moflight_ai.control'), 'p1')
        self.assertEqual(self.ok('select count(*) from moflight_ai.audit'), '3')
        self.denied("update moflight_ai.policies set body=body || '{\"reasoning\":\"low\"}'")

    def test_concurrent_global_and_account_caps(self):
        self.setup_policy(globalCapMicroEur=100000)
        for account in range(102, 109): self.account(str(account))
        queries = [self.reserve(str(101+i), 'a'+str(i), 'r'+str(i)) for i in range(8)]
        with ThreadPoolExecutor(max_workers=8) as pool: results = list(pool.map(self.sql, queries))
        self.assertEqual(sum(r.returncode==0 for r in results), 2)
        self.assertEqual(self.ok("select reserved from moflight_ai.period_totals where scope='*'"), '80000')
        self.assertEqual(self.ok('select count(*) from moflight_ai.rounds'), '2')

    def test_one_active_account_attempt_and_exact_duplicate_round(self):
        self.setup_policy()
        with ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(self.sql,[self.reserve(attempt='a'+str(i),run='r'+str(i)) for i in range(8)]))
        self.assertEqual(sum(r.returncode==0 for r in results),1)
        selected=self.ok('select id from moflight_ai.attempts'); run=self.ok('select run_id from moflight_ai.attempts')
        with ThreadPoolExecutor(max_workers=8) as pool: duplicates=list(pool.map(self.sql,[self.reserve(attempt=selected,run=run)]*8))
        self.assertTrue(all(r.returncode==0 and json.loads(r.stdout)['disposition']=='existing' for r in duplicates))
        self.denied(self.reserve(attempt=selected,run=run,digest='b'*64))
        self.assertEqual(self.ok('select count(*) from moflight_ai.rounds'),'1')

    def test_unknown_cancel_and_late_idempotent_settlement(self):
        self.setup_policy(); self.ok(self.reserve())
        self.ok("select public.moflight_ai_unknown('101','a1','r1',0)")
        self.ok("select public.moflight_ai_unknown('101','a1','r1',0)")
        self.assertEqual(self.ok("select public.moflight_ai_finish('101','a1','r1')"),'f')
        self.denied(self.reserve(attempt='a2',run='r2'))
        self.assertEqual(json.loads(self.ok("select public.moflight_ai_usage('101')"))['unknownMicroEur'],40000)
        self.assertEqual(self.settle()['actualMicroEur'],20000); self.assertEqual(self.settle()['actualMicroEur'],20000)
        self.denied("select public.moflight_ai_settle('101','a1','r1',0,21000000,'usage-1')")
        self.assertEqual(self.ok('select active from moflight_ai.attempts'),'f')
        self.ok(self.reserve(attempt='a2',run='r2'))

    def test_pinned_prompt_next_message_latest_policy_and_kill_revocation(self):
        self.setup_policy(); self.ok(self.reserve(feature='review')); self.settle()
        self.publish(base_policy(id='p2', systemPrompt='Latest prompt'),3)
        next_round=json.loads(self.ok(self.reserve(round_number=1,feature='review',digest='b'*64)))
        self.assertEqual(next_round['policy']['systemPrompt'],'Synthetic pinned prompt.')
        self.settle(round_number=1,receipt='usage-2');self.ok("select public.moflight_ai_finish('101','a1','r1')")
        self.denied(self.reserve(attempt='a2',run='r2',policy='p1'))
        self.assertEqual(json.loads(self.ok(self.reserve(attempt='a2',run='r2',policy='p2')))['policy']['systemPrompt'],'Latest prompt')
        self.settle(attempt='a2',run='r2',receipt='usage-3')
        self.ok("select public.moflight_ai_controls(4,true,true,true,'synthetic','emergency')")
        self.denied(self.reserve(attempt='a2',run='r2',round_number=1,policy='p2',digest='c'*64))

    def test_live_revocation_lower_limits_and_per_attempt_cap(self):
        self.setup_policy();self.ok(self.reserve(feature='review'));self.settle()
        self.publish(base_policy(id='p2',tools=['describeDataset']),3)
        self.denied(self.reserve(round_number=1,feature='review',digest='b'*64))
        self.ok("select public.moflight_ai_activate_policy('p1',4,'rollback')")
        self.ok(self.reserve(round_number=1,feature='review',digest='b'*64));self.settle(round_number=1,nano=40000000,receipt='usage-2')
        self.ok(self.reserve(round_number=2,feature='review',digest='c'*64));self.settle(round_number=2,nano=40000000,receipt='usage-3')
        self.denied(self.reserve(round_number=3,feature='review',digest='d'*64))

    def test_missing_price_funding_account_and_overage_halt(self):
        self.setup_policy()
        self.ok("select public.moflight_ai_controls(3,false,true,false,'synthetic','no-funding')")
        self.denied(self.reserve()); self.ok("select public.moflight_ai_controls(4,false,true,true,null,'no-price')")
        self.denied(self.reserve()); self.ok("select public.moflight_ai_controls(5,false,true,true,'synthetic','restore-price')")
        self.ok("select public.moflight_ai_account('101',false,true,'disable-account')"); self.denied(self.reserve())
        self.ok("select public.moflight_ai_account('101',true,true,'enable-synthetic')");self.ok(self.reserve())
        self.assertTrue(self.settle(nano=50000000)['halted']);self.ok("select public.moflight_ai_finish('101','a1','r1')")
        self.denied(self.reserve(attempt='a2',run='r2'));self.assertEqual(self.ok('select halted from moflight_ai.control'),'t')

    def test_month_rollover_retains_unknown_hold_and_original_settlement_period(self):
        self.setup_policy();self.ok(self.reserve());self.ok("select public.moflight_ai_unknown('101','a1','r1',0)")
        # Explicit owner-only fixture moves the admission period; runtime RPC accepts no clock/month input.
        self.ok("update moflight_ai.attempts set period='2020-01-01'; update moflight_ai.period_totals set period='2020-01-01'")
        usage=json.loads(self.ok("select public.moflight_ai_usage('101')"));self.assertEqual(usage['unknownMicroEur'],40000);self.assertEqual(usage['remainingMicroEur'],960000)
        self.settle();self.assertEqual(self.ok("select settled from moflight_ai.period_totals where scope='*' and period='2020-01-01'"),'20000')
        self.assertEqual(json.loads(self.ok("select public.moflight_ai_usage('101')"))['settledMicroEur'],0)

    def test_cleanup_only_settled_terminal_metadata_keeps_replay_fences(self):
        self.setup_policy();self.ok(self.reserve());self.settle();self.ok("select public.moflight_ai_finish('101','a1','r1')")
        self.ok("update moflight_ai.attempts set closed_at=clock_timestamp()-interval '91 days'")
        self.assertEqual(self.ok('select public.moflight_ai_cleanup()'),'0')  # Never prune a recently settled charge.
        self.ok("update moflight_ai.rounds set settled_at=clock_timestamp()-interval '91 days'")
        self.assertEqual(self.ok('select public.moflight_ai_cleanup()'),'1')
        self.denied(self.reserve()); self.ok(self.reserve(attempt='a2',run='r2'))
        self.denied("select public.moflight_ai_settle('101','a2','r2',0,20000000,'usage-1')")
        self.assertEqual(self.ok('select public.moflight_ai_cleanup()'),'0')

    def test_same_round_race_foreign_accounts_and_receipt_reuse(self):
        self.setup_policy();self.account('102')
        with ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(self.sql,[self.reserve()]*8))
        self.assertTrue(all(r.returncode==0 for r in results), [r.stderr for r in results])
        self.assertEqual(sum(json.loads(r.stdout)['disposition']=='new' for r in results),1)
        self.denied(self.reserve(account='102'))
        self.denied("select public.moflight_ai_unknown('102','a1','r1',0)")
        self.denied("select public.moflight_ai_settle('102','a1','r1',0,20000000,'foreign')")
        self.denied("select public.moflight_ai_finish('101','a1','foreign-run')")
        self.settle();self.ok(self.reserve(account='102',attempt='a2',run='r2'))
        self.denied("select public.moflight_ai_settle('102','a2','r2',0,20000000,'usage-1')")
        self.assertEqual(self.ok('select count(*) from moflight_ai.rounds'),'2')
        self.assertEqual(self.ok("select reserved from moflight_ai.period_totals where scope='*'"),'40000')

    def test_response_binding_protected_status_and_request_limits(self):
        self.setup_policy();self.account('102');self.ok(self.reserve())
        for role in ('anon','authenticated'):
            self.denied(f"set role {role}; select public.moflight_ai_status('101','a1','r1')")
            self.denied(f"set role {role}; select public.moflight_ai_record_response('101','a1','r1',0,'response1')")
        self.ok("select public.moflight_ai_record_response('101','a1','r1',0,'response1')")
        self.ok("select public.moflight_ai_record_response('101','a1','r1',0,'response1')")
        self.denied("select public.moflight_ai_record_response('101','a1','r1',0,'changed')")
        self.denied("select public.moflight_ai_record_response('102','a1','r1',0,'foreign')")
        status=json.loads(self.ok("select public.moflight_ai_status('101','a1','r1')"));self.assertEqual(status['rounds'][0]['responseId'],'response1')
        self.denied("select public.moflight_ai_status('102','a1','r1')")
        for _ in range(30):self.assertEqual(self.ok("select public.moflight_ai_request_admit('101')"),'t')
        self.assertEqual(self.ok("select public.moflight_ai_request_admit('101')"),'f')
        self.assertEqual(self.ok("select public.moflight_ai_request_admit('102')"),'t')
        self.assertEqual(self.ok("select public.moflight_ai_request_admit('999')"),'f')

    def test_personal_exhaustion_does_not_spend_other_account_allowance(self):
        self.setup_policy(personalCapMicroEur=50000,reviewCapMicroEur=50000);self.account('102')
        self.ok(self.reserve());self.settle(nano=40000000);self.ok("select public.moflight_ai_finish('101','a1','r1')")
        self.denied(self.reserve(attempt='a2',run='r2'))
        self.ok(self.reserve(account='102',attempt='a3',run='r3'))
        self.assertEqual(self.ok('select count(*) from moflight_ai.attempts'),'2')
        self.assertEqual(json.loads(self.ok("select public.moflight_ai_usage('101')"))['remainingMicroEur'],10000)

    def test_lowered_limits_feature_and_account_revocation_apply_to_pinned_run(self):
        self.setup_policy();self.ok(self.reserve(feature='review'));self.settle()
        self.publish(base_policy(id='p2',outputTokens=100,reviewTurns=1),3)
        self.denied(self.reserve(round_number=1,feature='review',digest='b'*64))
        self.publish(base_policy(id='p3',features=['question']),4)
        self.denied(self.reserve(round_number=1,feature='review',digest='b'*64))
        self.ok("select public.moflight_ai_activate_policy('p1',5,'rollback')")
        self.ok("select public.moflight_ai_account('101',false,true,'disable')")
        self.denied(self.reserve(round_number=1,feature='review',digest='b'*64))
        self.assertEqual(self.ok('select count(*) from moflight_ai.rounds'),'1')

    def test_sql_matches_independent_integer_and_berlin_vectors_and_rejects_missing_prices(self):
        fixture=subprocess.run(['node','--import','tsx','--input-type=module','-e',
            "import {MONEY_CASES,BERLIN_PERIOD_CASES} from './tests/mobile/fixtures/ai-money-cases.ts';process.stdout.write(JSON.stringify({money:MONEY_CASES,berlin:BERLIN_PERIOD_CASES}));"],
            cwd=ROOT,capture_output=True,text=True,timeout=15,creationflags=self.flags)
        self.assertEqual(fixture.returncode,0,fixture.stderr);vectors=json.loads(fixture.stdout)
        for c in vectors['berlin']:
            self.assertEqual(self.ok(f"select to_char(moflight_ai.berlin_period({quote(c['instantUtc'])}::timestamptz),'YYYY-MM')"),c['expectedPeriod'],c['id'])
        fields=dict(inputNanoUsd='input_nano_usd',cacheReadNanoUsd='cache_read_nano_usd',cacheWriteNanoUsd='cache_write_nano_usd',
                    outputNanoUsd='output_nano_usd',requestNanoUsd='request_nano_usd',grossMicroEurPerUsd='gross_micro_eur_per_usd',marginBps='margin_bps')
        price=dict(id='synthetic',approved=True,fees_covered=True,valid_from='2020-01-01T00:00:00Z',valid_until='2100-01-01T00:00:00Z')
        for c in vectors['money']:
            row=price | {v:c[k] for k,v in fields.items()}
            query=f"select moflight_ai.bound_for({quote(json.dumps(dict(inputTokens=c['inputTokens'],outputTokens=c['outputTokens'])))}::jsonb,jsonb_populate_record(null::moflight_ai.prices,{quote(json.dumps(row))}::jsonb))"
            if c['expectedMicroEur']>100000: self.denied(query)
            else: self.assertEqual(int(self.ok(query)),c['expectedMicroEur'],c['id'])
        row=price | {v:0 for v in fields.values()} | dict(gross_micro_eur_per_usd=1000000)
        for change in [dict(approved=False),dict(fees_covered=False),dict(input_nano_usd=None),dict(cache_write_nano_usd=None),
                       dict(gross_micro_eur_per_usd=None),dict(valid_until='2020-01-02T00:00:00Z')]:
            self.denied(f"select moflight_ai.bound_for('{{\"inputTokens\":1,\"outputTokens\":1}}',jsonb_populate_record(null::moflight_ai.prices,{quote(json.dumps(row|change))}::jsonb))")


if __name__ == '__main__':
    unittest.main()
