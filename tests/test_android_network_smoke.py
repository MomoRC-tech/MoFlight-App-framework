"""Local fixture transport checks; these do not establish Android acceptance."""
import http.client
from contextlib import closing
import threading
import unittest
from unittest.mock import patch

from scripts import android_network_smoke as network


class NetworkFixtureTests(unittest.TestCase):
    def setUp(self):
        with patch.object(network, 'PORT', 0):
            self.server = network.FixtureServer()
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.release.set()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def connection(self):
        return closing(http.client.HTTPConnection('127.0.0.1', self.server.server_address[1], timeout=2))

    def test_only_loopback_and_allowlisted_synthetic_pages(self):
        self.assertEqual(self.server.server_address[0], '127.0.0.1')
        with self.connection() as connection:
            connection.request('GET', network.PROFILE)
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            self.assertIn(b'Synthetic club', response.read())
            connection.request('GET', '/unapproved')
            self.assertEqual(connection.getresponse().status, 404)
        self.assertEqual(self.server.requests, [network.PROFILE])

    def test_interrupted_body_is_an_actual_incomplete_http_response(self):
        self.server.configure('drop-body', 1)
        with self.connection() as connection:
            connection.request('GET', network.FLIGHTS)
            response = connection.getresponse()
            self.assertTrue(self.server.reached.wait(1))
            self.server.release.set()
            with self.assertRaises(http.client.IncompleteRead) as failure:
                response.read()
            self.assertGreater(len(failure.exception.partial), 0)
        self.assertEqual(self.server.requests, [network.FLIGHTS])

    def test_header_disconnect_then_fresh_request_succeeds(self):
        self.server.configure('drop-headers', 1)
        with self.connection() as connection:
            connection.request('GET', network.PROFILE)
            self.assertTrue(self.server.reached.wait(1))
            self.server.release.set()
            with self.assertRaises(http.client.RemoteDisconnected):
                connection.getresponse()
        self.server.configure(count=22)
        with self.connection() as connection:
            connection.request('GET', network.FLIGHTS)
            self.assertIn(b'22 Datens', connection.getresponse().read())

    def test_stalled_body_has_headers_and_partial_content_but_no_completion(self):
        self.server.configure('stall-body', 1)
        with self.connection() as connection:
            connection.request('GET', network.FLIGHTS)
            response = connection.getresponse()
            self.assertTrue(self.server.reached.wait(1))
            self.assertEqual(response.status, 200)
            self.assertEqual(response.read(1), b'<')
            # The socket belongs to the HTTP/1.0 response after headers.
            response.fp.raw._sock.settimeout(.1)
            with self.assertRaises(TimeoutError):
                response.read()


if __name__ == '__main__':
    unittest.main()
