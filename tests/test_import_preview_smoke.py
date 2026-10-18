"""Native preview selector/safety regressions using synthetic hierarchies only."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

with patch.object(sys, 'path', [*sys.path, str(Path(__file__).resolve().parents[1] / 'scripts')]):
    import android_import_preview_smoke as trial


def control(selected='true', height=48):
    return {'content-desc': 'Test-Segelflugbuch A', 'clickable': 'true',
            'selected': selected, 'bounds': f'[10,200][350,{200 + height}]'}


class ImportPreviewTrialTests(unittest.TestCase):
    def test_retained_selection_ignores_explanatory_text_and_clipped_controls_without_reselecting(self):
        smoke = Mock()
        explanation = {'text': 'Frühere Testauswahl: Test-Segelflugbuch A', 'clickable': 'false', 'selected': 'false'}
        smoke.dump.side_effect = [[explanation], [explanation, control(height=20)], [explanation, control()]]
        with patch.object(trial, 'action') as action, patch.object(trial, 'check') as check:
            trial.retained_choice(smoke)
        self.assertEqual(smoke.swipe.call_count, 2)
        action.assert_called_once_with(smoke, 'Bearbeitung verwerfen')
        smoke.tap.assert_not_called()
        smoke.tap_node.assert_not_called()
        check.assert_called_once_with(smoke, 'accepted-repeat-and-nested-return-preserve-manual-choice')

    def test_an_unselected_real_control_is_a_failure_and_is_never_repaired_by_the_assertion(self):
        smoke = Mock()
        smoke.dump.return_value = [control(selected='false')]
        with patch.object(trial, 'action') as action, patch.object(trial, 'check') as check:
            with self.assertRaisesRegex(AssertionError, 'not retained'):
                trial.retained_choice(smoke)
        action.assert_not_called()
        check.assert_not_called()
        smoke.swipe.assert_not_called()

    def test_other_avds_are_rejected_before_app_or_display_operations(self):
        smoke = Mock()
        smoke.shell.return_value = '1'
        smoke.adb.return_value = SimpleNamespace(stdout='MoFlight_API37\nOK\n')
        with self.assertRaises(AssertionError):
            trial.execute(smoke, 'unused')
        smoke.shell.assert_called_once_with('getprop', 'ro.kernel.qemu')
        smoke.adb.assert_called_once_with('emu', 'avd', 'name')

    def test_physical_devices_are_rejected_before_any_app_operation(self):
        smoke = Mock()
        smoke.shell.return_value = '0'
        with self.assertRaises(AssertionError):
            trial.execute(smoke, 'unused')
        smoke.shell.assert_called_once_with('getprop', 'ro.kernel.qemu')
        smoke.adb.assert_not_called()
